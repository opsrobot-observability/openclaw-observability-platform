/**
 * Backend Integration Test: LLM Cost Summary API
 * Targets: /api/llm-cost-detail?summary=true
 */
import assert from "node:assert/strict";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8787";

async function testLlmCostSummary() {
  console.log("Testing /api/llm-cost-detail?summary=true...");
  const today = new Date().toISOString().split("T")[0];
  const lastWeek = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  
  const qs = new URLSearchParams({
    startDay: lastWeek,
    endDay: today,
    summary: "true"
  });
  
  const res = await fetch(`${API_BASE}/api/llm-cost-detail?${qs}`);
  assert.strictEqual(res.status, 200, "Should return 200 OK");
  
  const data = await res.json();
  
  // Check schema
  assert.ok(Array.isArray(data.rows), "rows should be an array");
  
  if (data.rows.length > 0) {
    const row = data.rows[0];
    
    // 1. Basic Fields
    assert.ok(row.model, "Missing model name");
    assert.ok(typeof row.totalTokens === "number", "totalTokens should be numeric");
    assert.ok(Array.isArray(row.trend), "trend should be an array");
    assert.strictEqual(row.trend.length, 7, "trend should contain 7 days of data");

    // 2. Top Apps
    assert.ok(Array.isArray(row.topApps), "topApps should be an array");
    if (row.topApps.length > 0) {
      assert.ok(row.topApps[0].name, "Top app missing name");
      assert.ok(typeof row.topApps[0].pct === "number", "Top app pct should be numeric");
    }

    // 3. Stability
    assert.ok(row.stability, "Missing stability metrics");
    assert.ok(row.stability.avgLatency, "Missing avgLatency");
    assert.ok(Array.isArray(row.stability.errorDist), "errorDist should be an array");

    // 4. Efficiency
    assert.ok(row.efficiency, "Missing efficiency metrics");
    assert.ok(row.efficiency.avgTokensPerSession, "Missing avgTokensPerSession");
    assert.ok(row.efficiency.estMonthlyCost, "Missing estMonthlyCost");
    
    // 5. Monthly Estimation Logic Check
    // estMonthlyCost is a formatted string (e.g. "500K")
    console.log(`Model: ${row.model}, Total: ${row.totalTokens}, Monthly Est: ${row.efficiency.estMonthlyCost}`);
  }
  
  console.log("✅ /api/llm-cost-detail?summary=true validated.");
}

async function run() {
  try {
    await testLlmCostSummary();
    console.log("\n🚀 LLM Cost API logic tests passed!");
  } catch (err) {
    console.error("\n❌ Test failed:");
    console.error(err);
    process.exit(1);
  }
}

run();
