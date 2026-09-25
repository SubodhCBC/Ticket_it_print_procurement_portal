import type { TransactionClient } from '../db/client'
import { COMMITTED_STATUSES } from '../orders/order-status'
import { BusinessRuleError } from '../utils/errors'
import { CartIssueCode } from './cart-validation'
import { evaluateBudget, type BudgetStatus } from './budget'

/**
 * The last word on both monthly caps, taken inside the transaction that places
 * the order (SOW AD-4: the branch's cap and the buyer's own).
 *
 * ---------------------------------------------------------------------------
 * Why validating the basket is not enough
 * ---------------------------------------------------------------------------
 * Checkout sums what has been committed this period and compares it with the
 * basket. Two buyers reaching that point at the same moment both read the same
 * total, both fit, and both place — and the branch ends the month over a cap
 * neither of them broke on their own. The same is true of one buyer with two
 * tabs open.
 *
 * So the sum is taken again here, after an exclusive lock on the thing being
 * measured: the branch for this period, and the buyer for this period. A second
 * placement that would share either lock waits for the first to commit and then
 * counts it. `sp_getapplock` with `@LockOwner = 'Transaction'` releases on
 * commit or rollback, so nothing has to unlock in a `finally` that a timed-out
 * transaction would refuse to run.
 *
 * Locks are taken branch first, buyer second, always. Two placements that need
 * both would otherwise be able to hold one each and wait for the other.
 *
 * Nothing is locked when the cap it protects does not exist, which is the
 * common case: an uncapped branch and an uncapped buyer place orders without
 * serialising against anybody.
 */

export interface BudgetGuardInput {
  readonly siteId: string
  readonly userId: string
  /** `YYYY-MM`, the period the order will be billed in. */
  readonly billingPeriod: string
  /** What this order adds, in cents — lines plus delivery. */
  readonly orderTotalCents: number
}

/** Five seconds: long enough for a placement to commit, short enough to answer. */
const LOCK_TIMEOUT_MS = 5000

async function lock(tx: TransactionClient, resource: string): Promise<void> {
  const [row] = await tx.$queryRawUnsafe<[{ result: number }]>(
    `DECLARE @result int;
     EXEC @result = sp_getapplock
       @Resource = @P1,
       @LockMode = 'Exclusive',
       @LockOwner = 'Transaction',
       @LockTimeout = ${LOCK_TIMEOUT_MS};
     SELECT @result AS result;`,
    resource
  )

  // 0 and 1 are "granted"; anything negative is a timeout, a deadlock victim or
  // a caller outside a transaction. Failing here refuses one order rather than
  // placing it against a total nobody counted.
  if (row.result < 0) {
    throw new BusinessRuleError(
      'Another order for this branch is being placed right now. Try again in a moment.',
      { details: { resource, result: row.result } }
    )
  }
}

async function committedTotalCents(
  tx: TransactionClient,
  where: { siteId?: string; placedById?: string; billingPeriod: string }
): Promise<number> {
  const committed = await tx.order.aggregate({
    where: { ...where, status: { in: [...COMMITTED_STATUSES] } },
    _sum: { total: true },
  })
  const total = committed._sum.total
  return total == null ? 0 : Math.round(Number(total.toFixed(2)) * 100)
}

function refuse(
  code: 'BUDGET_EXCEEDED' | 'USER_BUDGET_EXCEEDED',
  status: BudgetStatus
): never {
  const money = (cents: number) => (cents / 100).toFixed(2)
  const message =
    code === 'BUDGET_EXCEEDED'
      ? `This order would take the branch ${money(status.overageCents)} over its monthly budget.`
      : `This order would take you ${money(status.overageCents)} over your personal monthly limit.`

  // The shape a checkout refusal has, so a client that renders `details.issues`
  // shows this the same way it shows the one from validation.
  throw new BusinessRuleError(message, {
    details: {
      issues: [
        {
          code: CartIssueCode[code],
          message,
          lineId: null,
          details: {
            cap: money(status.capCents ?? 0),
            spent: money(status.spentCents),
            remaining: money(status.remainingCents ?? 0),
            overage: money(status.overageCents),
          },
        },
      ],
    },
  })
}

/**
 * Refuses the placement when either cap would be broken, counting orders that
 * committed while this one was being assembled.
 *
 * Call inside the placement transaction, before the order row is written.
 */
export async function assertBudgetsAllowOrder(
  tx: TransactionClient,
  input: BudgetGuardInput
): Promise<void> {
  const [site, user] = await Promise.all([
    tx.site.findFirst({
      where: { id: input.siteId },
      select: { monthlyBudget: true },
    }),
    tx.user.findFirst({
      where: { id: input.userId },
      select: { monthlyBudgetCap: true },
    }),
  ])

  const siteCapCents =
    site?.monthlyBudget == null
      ? null
      : Math.round(Number(site.monthlyBudget.toFixed(2)) * 100)
  const userCapCents =
    user?.monthlyBudgetCap == null
      ? null
      : Math.round(Number(user.monthlyBudgetCap.toFixed(2)) * 100)

  if (siteCapCents !== null) {
    await lock(tx, `budget:site:${input.siteId}:${input.billingPeriod}`)

    const status = evaluateBudget({
      capCents: siteCapCents,
      spentCents: await committedTotalCents(tx, {
        siteId: input.siteId,
        billingPeriod: input.billingPeriod,
      }),
      cartTotalCents: input.orderTotalCents,
    })
    if (status.wouldExceed) refuse('BUDGET_EXCEEDED', status)
  }

  if (userCapCents !== null) {
    await lock(tx, `budget:user:${input.userId}:${input.billingPeriod}`)

    const status = evaluateBudget({
      capCents: userCapCents,
      // No branch in the filter: the buyer's cap follows the person across every
      // branch they order for, which is what `checkUserBudget` measures too.
      spentCents: await committedTotalCents(tx, {
        placedById: input.userId,
        billingPeriod: input.billingPeriod,
      }),
      cartTotalCents: input.orderTotalCents,
    })
    if (status.wouldExceed) refuse('USER_BUDGET_EXCEEDED', status)
  }
}
