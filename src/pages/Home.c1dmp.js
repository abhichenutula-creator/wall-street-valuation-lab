// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
import { runWaccCalculation, runScenarioValuation, runReverseDcf, runSensitivityTable } from 'backend/valuationApi.web';

// Base Case matching test/engine/integration.test.js, used to numerically verify
// the Wix-hosted engine against the local tested engine.
const WACC_INPUTS = {
  riskFreeRate: 0.04,
  beta: 1.10,
  equityRiskPremium: 0.05,
  preTaxCostOfDebt: 0.06,
  taxRate: 0.25,
  marketValueOfEquity: 2500,
  debt: 300,
};

const SHARED = {
  baseRevenue: 1000,
  taxRate: 0.25,
  daPctRevenue: 0.05,
  capexPctRevenue: 0.06,
  nwcChangePctRevenue: 0.01,
  years: 5,
  exitMultiple: 10,
  cash: 200,
  debt: 300,
  dilutedShares: 100,
};

const fmt = (n) => (typeof n === 'number' ? n.toFixed(2) : 'N/A');

$w.onReady(function () {
  $w('#btnRunValuation').onClick(async () => {
    $w('#txtResults').text = 'Running...';

    const { wacc } = await runWaccCalculation(WACC_INPUTS);

    const base = await runScenarioValuation({ ...SHARED, revenueGrowth: 0.10, ebitMargin: 0.20, wacc, terminalGrowthRate: 0.025 });
    const bear = await runScenarioValuation({ ...SHARED, revenueGrowth: 0.03, ebitMargin: 0.14, wacc: wacc + 0.02, terminalGrowthRate: 0.015 });
    const bull = await runScenarioValuation({ ...SHARED, revenueGrowth: 0.18, ebitMargin: 0.26, wacc: Math.max(wacc - 0.02, 0.01), terminalGrowthRate: 0.035 });

    const reverse = await runReverseDcf({
      baseRevenue: 1000, ebitMargin: 0.20, taxRate: 0.25, daPctRevenue: 0.05, capexPctRevenue: 0.06,
      nwcChangePctRevenue: 0.01, years: 5, wacc, terminalGrowthRate: 0.025, cash: 200, debt: 300,
      dilutedShares: 100, targetPrice: 25,
    });

    const sens = await runSensitivityTable({
      waccRange: [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02],
      terminalGrowthRange: [0.015, 0.02, 0.025, 0.03, 0.035],
      baseCaseInputs: { ...SHARED, revenueGrowth: 0.10, ebitMargin: 0.20 },
    });

    const sensRow = sens.table[2].map(fmt).join('  |  ');

    $w('#txtResults').text =
      `WACC: ${fmt(wacc * 100)}%\n` +
      `Enterprise Value (Gordon): ${fmt(base.dcf.enterpriseValueGordon)}\n` +
      `Enterprise Value (Exit Multiple): ${fmt(base.dcf.enterpriseValueExitMultiple)}\n` +
      `Equity Value (Gordon): ${fmt(base.equityValueGordon)}\n` +
      `Implied Share Price (Gordon): $${fmt(base.impliedSharePriceGordon)}\n` +
      `Implied Share Price (Exit Multiple): $${fmt(base.impliedSharePriceExitMultiple)}\n\n` +
      `Bear implied price: $${fmt(bear.impliedSharePriceGordon)}\n` +
      `Base implied price: $${fmt(base.impliedSharePriceGordon)}\n` +
      `Bull implied price: $${fmt(bull.impliedSharePriceGordon)}\n\n` +
      `Reverse DCF (market price $25): implied growth ${fmt(reverse.impliedGrowthRate * 100)}%, converged=${reverse.converged}\n\n` +
      `Sensitivity row @ base WACC (g=1.5%..3.5%): ${sensRow}`;
  });
});
