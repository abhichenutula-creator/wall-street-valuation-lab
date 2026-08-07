import { calculateCostOfEquity, calculateAfterTaxCostOfDebt, calculateWACC } from '../src/engine/wacc.js';
import { calculateScenarioValue } from '../src/engine/scenarios.js';
import { solveReverseDCF } from '../src/engine/reverseDcf.js';
import { calculateSensitivityTable } from '../src/engine/sensitivity.js';

const form = document.getElementById('inputs-form');
const errorSection = document.getElementById('error');
const resultsSection = document.getElementById('results');

function readFormValues(form) {
  const data = new FormData(form);
  const values = {};
  for (const [key, value] of data.entries()) {
    values[key] = Number(value);
  }
  return values;
}

function fmt(n) {
  return typeof n === 'number' ? n.toFixed(2) : 'N/A';
}

function renderTable(el, headers, rows) {
  el.innerHTML =
    '<thead><tr>' + headers.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>' +
    '<tbody>' + rows.map((row) => '<tr>' + row.map((cell) => `<td>${cell}</td>`).join('') + '</tr>').join('') + '</tbody>';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  errorSection.hidden = true;
  resultsSection.hidden = true;

  try {
    const v = readFormValues(form);

    const costOfEquity = calculateCostOfEquity(v.riskFreeRate, v.beta, v.equityRiskPremium);
    const afterTaxCostOfDebt = calculateAfterTaxCostOfDebt(v.preTaxCostOfDebt, v.taxRate);
    // Uses an explicit market-value-of-equity input (not Current Market Price) so that
    // changing "Current Market Price" only affects Reverse DCF, never intrinsic value.
    const wacc = calculateWACC({
      costOfEquity,
      afterTaxCostOfDebt,
      equityValue: v.marketValueOfEquity,
      debtValue: v.debt,
    });

    const sharedInputs = {
      baseRevenue: v.baseRevenue,
      taxRate: v.taxRate,
      daPctRevenue: v.daPctRevenue,
      capexPctRevenue: v.capexPctRevenue,
      nwcChangePctRevenue: v.nwcChangePctRevenue,
      years: 5,
      exitMultiple: v.exitMultiple,
      cash: v.cash,
      debt: v.debt,
      dilutedShares: v.dilutedShares,
    };

    const base = calculateScenarioValue({
      ...sharedInputs,
      revenueGrowth: v.revenueGrowth,
      ebitMargin: v.ebitMargin,
      wacc,
      terminalGrowthRate: v.terminalGrowthRate,
    });

    renderTable(
      document.getElementById('summary-table'),
      ['Metric', 'Value'],
      [
        ['Cost of Equity', fmt(costOfEquity * 100) + '%'],
        ['After-Tax Cost of Debt', fmt(afterTaxCostOfDebt * 100) + '%'],
        ['WACC', fmt(wacc * 100) + '%'],
        ['Sum PV of UFCF', fmt(base.dcf.sumPvUFCF)],
        ['Enterprise Value (Gordon Growth)', fmt(base.dcf.enterpriseValueGordon)],
        ['Enterprise Value (Exit Multiple)', fmt(base.dcf.enterpriseValueExitMultiple)],
        ['Equity Value (Gordon Growth)', fmt(base.equityValueGordon)],
        ['Implied Share Price (Gordon Growth)', '$' + fmt(base.impliedSharePriceGordon)],
        ['Implied Share Price (Exit Multiple)', '$' + fmt(base.impliedSharePriceExitMultiple)],
      ]
    );

    const bear = calculateScenarioValue({
      ...sharedInputs,
      revenueGrowth: v.revenueGrowth * 0.4,
      ebitMargin: v.ebitMargin * 0.8,
      wacc: wacc + 0.02,
      terminalGrowthRate: Math.max(v.terminalGrowthRate - 0.01, 0),
    });
    const bull = calculateScenarioValue({
      ...sharedInputs,
      revenueGrowth: v.revenueGrowth * 1.6,
      ebitMargin: v.ebitMargin * 1.2,
      wacc: Math.max(wacc - 0.02, 0.01),
      terminalGrowthRate: v.terminalGrowthRate + 0.01,
    });

    renderTable(
      document.getElementById('scenario-table'),
      ['Scenario', 'Revenue Growth', 'EBIT Margin', 'WACC', 'Terminal Growth', 'Implied Price (Gordon)'],
      [
        ['Bear', fmt(v.revenueGrowth * 0.4 * 100) + '%', fmt(v.ebitMargin * 0.8 * 100) + '%', fmt((wacc + 0.02) * 100) + '%', fmt(Math.max(v.terminalGrowthRate - 0.01, 0) * 100) + '%', '$' + fmt(bear.impliedSharePriceGordon)],
        ['Base', fmt(v.revenueGrowth * 100) + '%', fmt(v.ebitMargin * 100) + '%', fmt(wacc * 100) + '%', fmt(v.terminalGrowthRate * 100) + '%', '$' + fmt(base.impliedSharePriceGordon)],
        ['Bull', fmt(v.revenueGrowth * 1.6 * 100) + '%', fmt(v.ebitMargin * 1.2 * 100) + '%', fmt(Math.max(wacc - 0.02, 0.01) * 100) + '%', fmt((v.terminalGrowthRate + 0.01) * 100) + '%', '$' + fmt(bull.impliedSharePriceGordon)],
      ]
    );

    const reverse = solveReverseDCF({
      ...sharedInputs,
      ebitMargin: v.ebitMargin,
      wacc,
      terminalGrowthRate: v.terminalGrowthRate,
      targetPrice: v.marketPrice,
    });

    renderTable(
      document.getElementById('reverse-dcf-table'),
      ['Metric', 'Value'],
      [
        ['Current Market Price', '$' + fmt(v.marketPrice)],
        ['Market-Implied Revenue CAGR', fmt(reverse.impliedGrowthRate * 100) + '%'],
        ['User Base-Case Revenue CAGR', fmt(v.revenueGrowth * 100) + '%'],
        ['Difference', fmt((v.revenueGrowth - reverse.impliedGrowthRate) * 100) + ' pts'],
      ]
    );

    const waccRange = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
    const terminalGrowthRange = [
      v.terminalGrowthRate - 0.01,
      v.terminalGrowthRate - 0.005,
      v.terminalGrowthRate,
      v.terminalGrowthRate + 0.005,
      v.terminalGrowthRate + 0.01,
    ];
    const sensitivity = calculateSensitivityTable({
      waccRange,
      terminalGrowthRange,
      baseCaseInputs: {
        ...sharedInputs,
        revenueGrowth: v.revenueGrowth,
        ebitMargin: v.ebitMargin,
      },
    });

    renderTable(
      document.getElementById('sensitivity-table'),
      ['WACC \\ g', ...terminalGrowthRange.map((g) => fmt(g * 100) + '%')],
      sensitivity.table.map((row, i) => [
        fmt(waccRange[i] * 100) + '%',
        ...row.map((cell, j) => {
          const isBase = Math.abs(waccRange[i] - wacc) < 1e-9 && Math.abs(terminalGrowthRange[j] - v.terminalGrowthRate) < 1e-9;
          const text = cell === null ? 'N/A' : '$' + fmt(cell);
          return isBase ? `<strong>${text}</strong>` : text;
        }),
      ])
    );

    resultsSection.hidden = false;
  } catch (err) {
    errorSection.hidden = false;
    errorSection.textContent = 'Error: ' + err.message;
  }
});
