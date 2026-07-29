import type { Borrower, Payment } from "@workspace/api-client-react";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

/**
 * Opens a new browser window and triggers the print dialog with a formatted
 * loan statement for the given borrower and their payment history.
 */
export function printStatement(borrower: Borrower, payments: Payment[]): void {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow popups to print the statement."); return; }

  const paidPayments = payments.filter(p => p.isPaid);
  const totalPaid = paidPayments.reduce((s, p) => s + p.interestAmount, 0);
  const totalCommission = paidPayments.reduce((s, p) => s + p.commissionAmount, 0);
  const totalPrincipalReduced = payments.reduce((s, p) => s + (p.principalReduction ?? 0), 0);

  win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Loan Statement — ${borrower.name}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; font-size: 14px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 24px; }
  .brand { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; }
  .brand-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
  .borrower-name { font-size: 20px; font-weight: 700; text-align: right; }
  .borrower-info { font-size: 12px; color: #64748b; text-align: right; margin-top: 4px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .card-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .card-value { font-size: 18px; font-weight: 700; }
  .green { color: #059669; } .blue { color: #2563eb; }
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  .paid { color: #059669; font-weight: 600; }
  .pending { color: #94a3b8; }
  .overdue { color: #dc2626; font-weight: 600; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">LoanLedger</div>
    <div class="brand-sub">Loan Account Statement</div>
    <div class="brand-sub" style="margin-top:8px">Generated: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>
  <div>
    <div class="borrower-name">${borrower.name}</div>
    <div class="borrower-info">${borrower.address}</div>
    ${borrower.phone ? `<div class="borrower-info">📞 ${borrower.phone}</div>` : ""}
    ${borrower.email ? `<div class="borrower-info">✉ ${borrower.email}</div>` : ""}
  </div>
</div>

<div class="grid">
  <div class="card"><div class="card-label">Original Principal</div><div class="card-value">${fmt(borrower.principalAmount)}</div></div>
  <div class="card"><div class="card-label">Interest Rate</div><div class="card-value">${borrower.interestRate}% / month</div></div>
  <div class="card"><div class="card-label">Commission Rate</div><div class="card-value green">${borrower.commissionRate}% / month</div></div>
  <div class="card"><div class="card-label">Loan Start</div><div class="card-value" style="font-size:15px">${borrower.startDate}</div></div>
  <div class="card"><div class="card-label">Status</div><div class="card-value" style="font-size:15px;text-transform:capitalize">${borrower.status}</div></div>
  ${totalPrincipalReduced > 0 ? `<div class="card"><div class="card-label">Principal Reduced</div><div class="card-value blue">-${fmt(totalPrincipalReduced)}</div></div>` : ""}
</div>

<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;background:#ecfdf5;border-radius:8px;padding:16px;border:1px solid #a7f3d0">
  <div><div class="card-label" style="color:#065f46">Total Collected</div><div style="font-size:18px;font-weight:700;color:#059669">${fmt(totalPaid)}</div></div>
  <div><div class="card-label" style="color:#065f46">Commission Earned</div><div style="font-size:18px;font-weight:700;color:#059669">${fmt(totalCommission)}</div></div>
  <div><div class="card-label" style="color:#065f46">Payments (Paid/Total)</div><div style="font-size:18px;font-weight:700;color:#059669">${paidPayments.length} / ${payments.length}</div></div>
</div>

<h2>Payment History</h2>
<table>
  <thead>
    <tr>
      <th>Period</th>
      <th>Outstanding</th>
      <th>Interest Due</th>
      <th>Amount Paid</th>
      <th>Principal ↓</th>
      <th>Commission</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    ${payments.map(p => {
      const now = new Date();
      const isOverdue = !p.isPaid && (p.year * 12 + (p.month - 1) < now.getFullYear() * 12 + now.getMonth());
      return `<tr>
        <td>${MONTHS_FULL[p.month - 1]} ${p.year}</td>
        <td>${fmt(p.principalAmount)}</td>
        <td>${fmt(p.interestAmount)}</td>
        <td>${p.amountPaid != null ? fmt(p.amountPaid) : "—"}</td>
        <td>${(p.principalReduction ?? 0) > 0 ? "−" + fmt(p.principalReduction) : "—"}</td>
        <td>${fmt(p.commissionAmount)}</td>
        <td class="${p.isPaid ? "paid" : isOverdue ? "overdue" : "pending"}">${p.isPaid ? "✓ Paid" + (p.paidDate ? " (" + p.paidDate + ")" : "") : isOverdue ? "⚠ Overdue" : "Pending"}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>

<div class="footer">
  <span>LoanLedger · Confidential</span>
  <span>Statement as of ${new Date().toLocaleDateString("en-IN")}</span>
</div>
</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 600);
}
