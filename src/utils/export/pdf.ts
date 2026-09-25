// src/lib/export/pdf.ts
import type { MonthlyBillingReport } from '@/types'
import { formatMoney } from '@/lib/format'

export function printBillingReportPDF(report: MonthlyBillingReport) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Billing Statement - ${report.invoiceNumber}</title>
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #2b253e; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #f73582; padding-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; color: #2b253e; }
          .meta { margin-top: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
          .meta-box { background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0; }
          .label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: bold; }
          .value { font-size: 16px; font-weight: bold; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 30px; }
          th { background: #2b253e; color: #fff; text-align: left; padding: 10px; font-size: 12px; }
          td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
          .total-row { font-weight: bold; background: #fff0f6; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">MONTHLY CONSOLIDATED BILLING</div>
            <div style="color: #f73582; font-weight: bold; margin-top: 4px;">Print Procurement Portal</div>
          </div>
          <div style="text-align: right;">
            <div><strong>Invoice:</strong> ${report.invoiceNumber}</div>
            <div><strong>Period:</strong> ${report.period}</div>
            <div><strong>Due Date:</strong> ${report.dueDate}</div>
          </div>
        </div>

        <div class="meta">
          <div class="meta-box">
            <div class="label">Total Amount Due</div>
            <div class="value" style="color: #f73582;">${formatMoney(report.totalSpend)}</div>
          </div>
          <div class="meta-box">
            <div class="label">Active Branches / Sites</div>
            <div class="value">${report.activeSitesCount} Sites</div>
          </div>
          <div class="meta-box">
            <div class="label">Total Dispatched Orders</div>
            <div class="value">${report.totalOrders} Orders</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Site Code</th>
              <th>Site Branch Name</th>
              <th>Account</th>
              <th>Orders</th>
              <th>Top Collateral Category</th>
              <th style="text-align: right;">Subtotal (NZD)</th>
            </tr>
          </thead>
          <tbody>
            ${report.siteBreakdowns
              .map(
                (s) => `
              <tr>
                <td><strong>${s.siteCode}</strong></td>
                <td>${s.siteName}</td>
                <td>${s.accountName}</td>
                <td>${s.ordersCount}</td>
                <td>${s.topCategory}</td>
                <td style="text-align: right; font-weight: bold;">${formatMoney(s.totalSpend)}</td>
              </tr>
            `
              )
              .join('')}
            <tr class="total-row">
              <td colspan="5" style="text-align: right;"><strong>TOTAL CONSOLIDATED SPEND:</strong></td>
              <td style="text-align: right; color: #f73582;"><strong>${formatMoney(report.totalSpend)}</strong></td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by Print Procurement Portal • All charges verified against active rate cards.
        </div>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => {
    printWindow.print()
  }, 500)
}
