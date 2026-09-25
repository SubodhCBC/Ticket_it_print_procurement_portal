/**
 * The PO format validator (SOW QA-01 names it as a unit-test target; the rule is
 * F-14 and AD-8).
 *
 *   node --import tsx scripts/verify-po-format.mjs
 *   npm run verify                                   # runs it first
 *
 * ---------------------------------------------------------------------------
 * Why a script and not a test runner
 * ---------------------------------------------------------------------------
 * The repository has no unit-test runner, and every other verification is a
 * script in this folder that `verify-all.mjs` drives and whose exit code says
 * whether it held. Adding a framework for one module would be a second way of
 * doing the same job. This is written so that moving it into one later is a
 * change of `check()` to `expect()` and nothing else.
 *
 * Needs no database, no server and no network: it imports the pure modules
 * directly, which is also why it runs through tsx rather than plain node.
 *
 * ---------------------------------------------------------------------------
 * Time is pinned
 * ---------------------------------------------------------------------------
 * `YY` depends on the date, so every call that reads one is given a fixed
 * instant. A check that passed in 2026 and failed on 1 January 2027 would be a
 * test of the calendar, not of the validator.
 */
import {
  examplePoReference,
  matchPoFormat,
  parsePoFormat,
  previewPoFormat,
} from '../src/lib/po-format.ts'
import {
  checkPurchaseOrder,
  resolvePurchaseOrderPolicy,
} from '../src/server/cart/purchase-order.ts'
import { PoFormatField } from '../src/server/cart/po-format.validation.ts'

let pass = 0
let fail = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else fail++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  ` +
      `(got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`
  )
}

const IN_2026 = new Date('2026-09-16T12:00:00Z')
const NEW_YEARS_EVE_UTC = new Date('2026-12-31T23:59:59Z')
const IN_2099 = new Date('2099-06-01T00:00:00Z')

const lengthOf = (format) => {
  const parsed = parsePoFormat(format)
  return parsed.ok ? parsed.length : null
}

// ---------------------------------------------------------------------------
console.log('--- reading a format ---')

check('PO-####-YY is ten characters', lengthOf('PO-####-YY'), 10)
check('shorter than three is refused', parsePoFormat('#Y').ok, false)
check('65 characters is refused', parsePoFormat('#'.repeat(65)).ok, false)
check('64 characters is accepted', parsePoFormat('#'.repeat(64)).ok, true)
check('a format with no symbol is refused', parsePoFormat('PO-1234').ok, false)
check('a space is refused', parsePoFormat('PO ####').ok, false)
check('a dot is refused', parsePoFormat('PO.####').ok, false)
check('starting with a dash is refused', parsePoFormat('-####').ok, false)
check('starting with a symbol is accepted', parsePoFormat('####-YY').ok, true)
check(
  'lower-case yy is a literal, so po-yy has no symbol',
  parsePoFormat('po-yy').ok,
  false
)
check(
  'YYY reads as a year then a literal Y',
  (() => {
    const parsed = parsePoFormat('#YYY')
    return parsed.ok ? parsed.tokens.map((token) => token.kind) : null
  })(),
  ['DIGIT', 'YEAR', 'LITERAL']
)
check(
  'the refusal names the character',
  parsePoFormat('PO$####').ok === false &&
    parsePoFormat('PO$####').message.includes('"$"'),
  true
)

// ---------------------------------------------------------------------------
console.log('\n--- matching a reference ---')

const FORMAT = 'PO-####-YY'
check(
  'a reference that fits',
  matchPoFormat('PO-1234-26', FORMAT, IN_2026),
  null
)
check(
  'literals ignore case',
  matchPoFormat('po-1234-26', FORMAT, IN_2026),
  null
)
check('one short', matchPoFormat('PO-123-26', FORMAT, IN_2026), 'LENGTH')
check('one long', matchPoFormat('PO-12345-26', FORMAT, IN_2026), 'LENGTH')
check(
  'a letter where a digit goes',
  matchPoFormat('PO-12A4-26', FORMAT, IN_2026),
  'CHARACTER'
)
check(
  'the wrong literal',
  matchPoFormat('PX-1234-26', FORMAT, IN_2026),
  'CHARACTER'
)
check('last year', matchPoFormat('PO-1234-25', FORMAT, IN_2026), null)
check('next year', matchPoFormat('PO-1234-27', FORMAT, IN_2026), null)
check('two years back', matchPoFormat('PO-1234-24', FORMAT, IN_2026), 'YEAR')
check(
  'a year that is not digits',
  matchPoFormat('PO-1234-2X', FORMAT, IN_2026),
  'CHARACTER'
)
check(
  '2099 accepts 00 as next year',
  matchPoFormat('PO-1234-00', FORMAT, IN_2099),
  null
)
check(
  '2099 accepts 98 as last year',
  matchPoFormat('PO-1234-98', FORMAT, IN_2099),
  null
)
check(
  '23:59 UTC on 31 December already accepts next year',
  matchPoFormat('PO-1234-27', FORMAT, NEW_YEARS_EVE_UTC),
  null
)
check('@ and * together', matchPoFormat('AB/12x4', '@@/##*#', IN_2026), null)
check(
  '@ refuses a digit',
  matchPoFormat('A1/1234', '@@/####', IN_2026),
  'CHARACTER'
)
check(
  'a stored format that does not parse blocks nothing',
  matchPoFormat('anything', 'PO 1234', IN_2026),
  null
)

// The shape a regular expression built from admin input would backtrack on.
const started = Date.now()
for (let run = 0; run < 20_000; run += 1) {
  matchPoFormat('A'.repeat(63) + '!', '*'.repeat(64), IN_2026)
}
check(
  '20,000 adversarial matches in under a second',
  Date.now() - started < 1000,
  true
)

// ---------------------------------------------------------------------------
console.log('\n--- examples and the admin preview ---')

check(
  'example for PO-####-YY',
  examplePoReference('PO-####-YY', IN_2026),
  'PO-1234-26'
)
check(
  'example for @@/#####',
  examplePoReference('@@/#####', IN_2026),
  'AB/12345'
)
check(
  'every example fits its own format',
  ['PO-####-YY', '@@/#####', 'ACM-****', '*@#YY-*'].every(
    (format) =>
      matchPoFormat(examplePoReference(format, IN_2026), format, IN_2026) ===
      null
  ),
  true
)
check(
  'no example for a format that does not parse',
  examplePoReference('PO', IN_2026),
  null
)
check('the preview trims', previewPoFormat('  PO-####-YY  ', IN_2026), {
  ok: true,
  example: 'PO-1234-26',
  length: 10,
})
check(
  'the preview explains a refusal',
  previewPoFormat('PO', IN_2026).ok,
  false
)

// ---------------------------------------------------------------------------
console.log('\n--- the field admin forms send ---')

check('trims', PoFormatField.parse('  PO-####  '), 'PO-####')
check('blank becomes null', PoFormatField.parse('   '), null)
check('null stays null', PoFormatField.parse(null), null)
check('omitted stays omitted', PoFormatField.parse(undefined), undefined)
const refused = PoFormatField.safeParse('PO-1234')
check(
  "refuses with the parser's own message",
  [
    refused.success,
    !refused.success &&
      refused.error.issues[0].message.startsWith(
        'A PO format needs at least one symbol'
      ),
  ],
  [false, true]
)

// ---------------------------------------------------------------------------
console.log('\n--- the purchase-order rule ---')

const source = (siteFormat, accountFormat, extra = {}) => ({
  site: { poRequired: false, poPrefix: null, poFormat: siteFormat },
  account: { requirePoNumber: true, poPrefix: null, poFormat: accountFormat },
  ...extra,
})

const accountRule = resolvePurchaseOrderPolicy(source(null, FORMAT), IN_2026)
check(
  "the account's format applies",
  [accountRule.format, accountRule.formatFrom, accountRule.formatExample],
  [FORMAT, 'ACCOUNT', 'PO-1234-26']
)
const siteRule = resolvePurchaseOrderPolicy(source('BR-###', FORMAT), IN_2026)
check(
  "the site's format wins",
  [siteRule.format, siteRule.formatFrom],
  ['BR-###', 'SITE']
)
const noRule = resolvePurchaseOrderPolicy(source('  ', null), IN_2026)
check(
  'a blank site format falls through to none',
  [noRule.format, noRule.formatFrom, noRule.formatExample],
  [null, 'NONE', null]
)
check(
  'the required message names the format and an example',
  checkPurchaseOrder(null, accountRule, IN_2026).message,
  'A purchase order reference is required, in the format "PO-####-YY" (for example "PO-1234-26").'
)
check(
  'a fitting reference is valid',
  checkPurchaseOrder('PO-4321-26', accountRule, IN_2026).valid,
  true
)
const misfit = checkPurchaseOrder('PO-43-26', accountRule, IN_2026)
check(
  'a misfit says how',
  [misfit.problem, misfit.message],
  [
    'PO_FORMAT_MISMATCH',
    'This purchase order reference must be 10 characters in the format "PO-####-YY" (for example "PO-1234-26").',
  ]
)
const prefixed = resolvePurchaseOrderPolicy(
  { ...source(null, FORMAT), userPoPrefix: 'QQ' },
  IN_2026
)
check(
  'the prefix is checked before the format',
  checkPurchaseOrder('PO-43-26', prefixed, IN_2026).problem,
  'PO_PREFIX_MISMATCH'
)
check(
  'the character rule still comes first',
  checkPurchaseOrder('PO 1234 26', accountRule, IN_2026).problem,
  'PO_INVALID_CHARACTERS'
)
check(
  'the minimum length still comes first',
  checkPurchaseOrder('P1', accountRule, IN_2026).problem,
  'PO_TOO_SHORT'
)
check(
  'with no format, nothing changes',
  checkPurchaseOrder('ANY-REF-9', noRule, IN_2026).valid,
  true
)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
