// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
import { runWaccCalculation, runScenarioValuation, runReverseDcf, runSensitivityTable } from 'backend/valuationApi.web';
import { importCompanyData, debugFetchBalance, debugFetchCashflow } from 'backend/companyImport.web';

// Bridges the embedded dashboard (public/dashboard.html, hosted on GitHub Pages
// inside an HTML Component) to the verified Velo backend via postMessage/onMessage.
// No financial logic lives here — every number comes from src/backend/valuation/*.js.

async function computeAll(payload) {
  const wacc = await runWaccCalculation(payload.wacc);

  const scenario = (inputs, waccDelta) =>
    runScenarioValuation({
      ...payload.shared,
      revenueGrowth: inputs.revenueGrowth,
      ebitMargin: inputs.ebitMargin,
      wacc: wacc.wacc + (waccDelta || 0),
      terminalGrowthRate: inputs.terminalGrowthRate,
    });

  const [base, bear, bull] = await Promise.all([
    scenario(payload.base, 0),
    scenario(payload.bear, payload.bear.waccDelta),
    scenario(payload.bull, payload.bull.waccDelta),
  ]);

  const reverse = await runReverseDcf({
    baseRevenue: payload.shared.baseRevenue,
    ebitMargin: payload.base.ebitMargin,
    taxRate: payload.shared.taxRate,
    daPctRevenue: payload.shared.daPctRevenue,
    capexPctRevenue: payload.shared.capexPctRevenue,
    nwcChangePctRevenue: payload.shared.nwcChangePctRevenue,
    years: payload.shared.years,
    wacc: wacc.wacc,
    terminalGrowthRate: payload.base.terminalGrowthRate,
    cash: payload.shared.cash,
    debt: payload.shared.debt,
    dilutedShares: payload.shared.dilutedShares,
    targetPrice: payload.reverseTargetPrice,
  });

  const waccRange = [wacc.wacc - 0.02, wacc.wacc - 0.01, wacc.wacc, wacc.wacc + 0.01, wacc.wacc + 0.02];
  const terminalGrowthRange = payload.sensitivityGSpan.map((d) => payload.base.terminalGrowthRate + d);
  const sensitivity = await runSensitivityTable({
    waccRange,
    terminalGrowthRange,
    baseCaseInputs: {
      ...payload.shared,
      revenueGrowth: payload.base.revenueGrowth,
      ebitMargin: payload.base.ebitMargin,
    },
  });

  return { wacc, base, bear, bull, reverse, sensitivity };
}

$w.onReady(function () {
  // TEMPORARY debug calls — verifying balance-sheet/cash-flow endpoints and
  // the changeInWorkingCapital sign-flip assumption against real MSFT data.
  // Plain-text logs (not JSON.stringify of a whole object) so the Developer
  // Console prints them directly instead of a collapsed JSON tree. Remove
  // once verification is complete.
  debugFetchBalance('MSFT').then((r) => {
    if (!r.ok) { console.log('[wsvl:debug] BALANCE ERROR ' + r.error); return; }
    const b = r.data[0];
    console.log('[wsvl:debug] BALANCE date=' + b.date + ' cash=' + b.cashAndCashEquivalents + ' totalDebt=' + b.totalDebt + ' shortTermDebt=' + b.shortTermDebt + ' longTermDebt=' + b.longTermDebt);
  });
  debugFetchCashflow('MSFT').then((r) => {
    if (!r.ok) { console.log('[wsvl:debug] CASHFLOW ERROR ' + r.error); return; }
    const c = r.data[0];
    console.log('[wsvl:debug] CASHFLOW date=' + c.date + ' da=' + c.depreciationAndAmortization + ' capex=' + c.capitalExpenditure + ' changeInWorkingCapital=' + c.changeInWorkingCapital + ' netCashProvidedByOperatingActivities=' + c.netCashProvidedByOperatingActivities + ' freeCashFlow=' + c.freeCashFlow);
  });
  importCompanyData('MSFT').then((r) => {
    console.log('[wsvl:debug] IMPORT company.name=' + (r.company && r.company.name) + ' price=' + (r.company && r.company.price) + ' beta=' + (r.company && r.company.beta));
    console.log('[wsvl:debug] IMPORT shared.baseRevenue=' + (r.shared && r.shared.baseRevenue) + ' taxRate=' + (r.shared && r.shared.taxRate) + ' cash=' + (r.shared && r.shared.cash) + ' debt=' + (r.shared && r.shared.debt) + ' dilutedShares=' + (r.shared && r.shared.dilutedShares));
    console.log('[wsvl:debug] IMPORT base.revenueGrowth=' + (r.base && r.base.revenueGrowth) + ' ebitMargin=' + (r.base && r.base.ebitMargin));
    console.log('[wsvl:debug] IMPORT historicalLen=' + (r.historical ? r.historical.length : 0) + ' warningsCount=' + (r.warnings ? r.warnings.length : 0));
    if (r.warnings && r.warnings.length) console.log('[wsvl:debug] IMPORT warnings=' + r.warnings.join(' | '));
  }).catch((err) => console.log('[wsvl:debug] IMPORT ERROR ' + err.message));

  const dashboard = $w('#htmlDashboard');

  dashboard.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || msg.source !== 'wsvl') return;

    if (msg.type === 'wsvl:request') {
      try {
        const result = await computeAll(msg.payload);
        dashboard.postMessage({ source: 'wsvl', type: 'wsvl:response', requestId: msg.requestId, payload: result });
      } catch (err) {
        dashboard.postMessage({ source: 'wsvl', type: 'wsvl:error', requestId: msg.requestId, message: err.message });
      }
      return;
    }

    if (msg.type === 'wsvl:import-request') {
      try {
        const result = await importCompanyData(msg.payload.ticker);
        dashboard.postMessage({ source: 'wsvl', type: 'wsvl:import-response', requestId: msg.requestId, payload: result });
      } catch (err) {
        dashboard.postMessage({ source: 'wsvl', type: 'wsvl:import-error', requestId: msg.requestId, message: err.message });
      }
    }
  });
});
