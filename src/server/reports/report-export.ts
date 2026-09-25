import type { AuthenticatedActor } from '../context/request-context'
import type { DateRange } from './report-periods'
import type { ReportContext } from './report-table'

/**
 * What an export route tells the About sheet: who pulled it, when, and with
 * which filters.
 *
 * Kept to the filters the caller actually sent plus the window resolved from
 * them. "From: all" is a statement about the data, so an unset filter is shown
 * as such rather than left out.
 */
export function exportContext(
  actor: AuthenticatedActor,
  accountId: string | null,
  parameters: Readonly<Record<string, string | null | undefined>>,
  range?: DateRange
): ReportContext {
  return {
    generatedAt: new Date(),
    generatedBy: actor.email,
    parameters: {
      ...(range
        ? {
            From: range.from.toISOString(),
            // Exclusive, as every report window is: midnight after the last day.
            'To (exclusive)': range.to.toISOString(),
          }
        : {}),
      // Null for a platform-wide report, which covers every account.
      Account: accountId ?? 'every account',
      ...parameters,
    },
    ...(range ? { range } : {}),
  }
}
