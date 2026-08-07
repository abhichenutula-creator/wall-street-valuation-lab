// API Reference: https://www.wix.com/velo/reference/api-overview/introduction
import { runWaccCalculation, runScenarioValuation, runReverseDcf, runSensitivityTable } from 'backend/valuationApi.web';
import { importCompanyData } from 'backend/companyImport.web';

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
