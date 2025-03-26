console.log("script.js loaded");

let economicEffectChart;
let pricingData = null;

// ▼ ① DOM読み込み完了後の処理
window.addEventListener("DOMContentLoaded", function() {
  const costInputCheckbox = document.getElementById("costInputCheckbox");
  const usageContainer     = document.getElementById("usageInputContainer");
  const costContainer      = document.getElementById("costInputContainer");

  costInputCheckbox.addEventListener("change", function() {
    if (this.checked) {
      usageContainer.style.display = "none";
      costContainer.style.display  = "flex";
    } else {
      costContainer.style.display  = "none";
      usageContainer.style.display = "flex";
    }
  });
});

// ▼ ② prices.json を読み込み
fetch('prices.json')
  .then(response => response.json())
  .then(data => {
    pricingData = data;
    initializeSimulation();
  })
  .catch(error => {
    console.error("Error loading prices.json: ", error);
    // エラー時のデフォルト値
    pricingData = {
      panelUnitPrice: 215000,
      batteryPrices: {
        "OG-BAT512": 672100,
        "OG-BAT1024": 959200,
        "OG-BAT1536": 1200100,
        "PDS-1600S03E": 658000,
        "PDH-6000s01": 1850000
      }
    };
    initializeSimulation();
  });

// 初期化処理：各 input, select, チェックボックスにイベントリスナーを設定
function initializeSimulation() {
  document.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("change", () => {
      updateBatteryOtherInput();
      calculate();
    });
    el.addEventListener("input", () => {
      updateBatteryOtherInput();
      calculate();
    });
  });
  updateBatteryOtherInput();
  calculate();
}

// 蓄電池「その他」入力欄の表示/非表示
function updateBatteryOtherInput() {
  const batterySelect = document.getElementById("battery");
  const batteryOtherContainer = document.getElementById("batteryOtherContainer");
  if (batterySelect.value === "other") {
    batteryOtherContainer.style.display = "block";
  } else {
    batteryOtherContainer.style.display = "none";
  }
}

// 「電気代から入力」チェックボックスで、使用電気量欄と電気代金欄を切り替え
// ※ DOMContentLoaded内で既に登録しているので、以下は不要orコメントアウトしてもOK
/*
document.getElementById("costInputCheckbox").addEventListener("change", function() {
  let costContainer = document.getElementById("costInputContainer");
  let usageContainer = document.getElementById("usageInputContainer");
  if (this.checked) {
    usageContainer.style.display = "none";
    costContainer.style.display = "flex";
  } else {
    costContainer.style.display = "none";
    usageContainer.style.display = "flex";
  }
});
*/

// グラフ更新関数（通常の経済効果グラフ）
function updateGraphPlan2(years, savingsArray, sellIncomeArray, installationCost, debugText) {
  const ctx = document.getElementById("economicEffectChart").getContext("2d");
  if (economicEffectChart) {
    economicEffectChart.destroy();
  }
  economicEffectChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          label: "節電金額",
          data: savingsArray,
          backgroundColor: "#4CAF50"
        },
        {
          label: "売電金額",
          data: sellIncomeArray,
          backgroundColor: "#FFA500"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      },
      plugins: {
        annotation: {
          annotations: {
            equipmentLine: {
              type: "line",
              scaleID: "y",
              value: installationCost,
              borderColor: "red",
              borderWidth: 2,
              label: {
                enabled: true,
                content: "設備導入費用: " + installationCost.toLocaleString() + " 円",
                position: "end",
                backgroundColor: "rgba(255, 0, 0, 0.7)",
                font: { size: 12 }
              }
            }
          }
        }
      }
    }
  });

  // デバッグ機能はコメントアウト
  // document.getElementById("debugEquipmentCost").innerText = debugText;
}

// グラフ更新関数（太陽光導入済の場合用：蓄電池導入後経済効果の累積グラフ）
function updateGraphBatteryEffect(years, batteryEffectArray, equipmentCost, debugText) {
  const ctx = document.getElementById("economicEffectChart").getContext("2d");
  if (economicEffectChart) {
    economicEffectChart.destroy();
  }
  economicEffectChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [
        {
          label: "蓄電池導入後経済効果の累積",
          data: batteryEffectArray,
          backgroundColor: "#2196F3"
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { beginAtZero: true },
        y: { beginAtZero: true }
      },
      plugins: {
        annotation: {
          annotations: {
            equipmentLine: {
              type: "line",
              scaleID: "y",
              value: equipmentCost,
              borderColor: "red",
              borderWidth: 2,
              label: {
                enabled: true,
                content: "設備導入費用: " + equipmentCost.toLocaleString() + " 円",
                position: "end",
                backgroundColor: "rgba(255, 0, 0, 0.7)",
                font: { size: 12 }
              }
            }
          }
        }
      }
    }
  });

  // デバッグ機能はコメントアウト
  // document.getElementById("debugEquipmentCost").innerText = debugText;
}

// 売電単価（固定買い取り制度終了後の設定：8.5円）
function getSellingPrice() {
  return 8.5;
}

// 電気料金計算（東京電力従量電灯Bモデル、年間）
function calculateElectricityCost(annualUsage) {
  const basicFee50A = 1558.75;
  const basicFee60A = 1870.50;
  const annualBasicFee50A = basicFee50A * 12;
  const annualBasicFee60A = basicFee60A * 12;
  
  const tier1Limit = 120;
  const tier2Limit = 300;
  const tier1Rate = 29.3;
  const tier2Rate = 36.4;
  const tier3Rate = 40.49;
  const discountPerKwh = 3.0;
  
  let monthlyUsage = annualUsage / 12;
  let monthlyCost = 0;
  if (monthlyUsage <= tier1Limit) {
    monthlyCost = monthlyUsage * tier1Rate;
  } else if (monthlyUsage <= tier2Limit) {
    monthlyCost = (tier1Limit * tier1Rate) + ((monthlyUsage - tier1Limit) * tier2Rate);
  } else {
    monthlyCost = (tier1Limit * tier1Rate)
                + ((tier2Limit - tier1Limit) * tier2Rate)
                + ((monthlyUsage - tier2Limit) * tier3Rate);
  }
  monthlyCost -= monthlyUsage * discountPerKwh;
  let annualEnergyCost = monthlyCost * 12;
  
  let contractA = (annualUsage < 4200) ? 50 : 60;
  let annualBasicFee = (contractA === 50) ? annualBasicFee50A : annualBasicFee60A;
  
  return Math.round(annualBasicFee + annualEnergyCost);
}

// 新規：月間の電気料金を算出する関数（買電量に対する料金、従量料金部分のみ）
function calculateMonthlyCost(monthlyUsage) {
  const tier1Limit = 120;
  const tier2Limit = 300;
  const tier1Rate = 29.3;
  const tier2Rate = 36.4;
  const tier3Rate = 40.49;
  const discountPerKwh = 3.0;
  let cost = 0;
  if (monthlyUsage <= tier1Limit) {
    cost = monthlyUsage * tier1Rate;
  } else if (monthlyUsage <= tier2Limit) {
    cost = (tier1Limit * tier1Rate)
          + ((monthlyUsage - tier1Limit) * tier2Rate);
  } else {
    cost = (tier1Limit * tier1Rate)
          + ((tier2Limit - tier1Limit) * tier2Rate)
          + ((monthlyUsage - tier2Limit) * tier3Rate);
  }
  cost -= monthlyUsage * discountPerKwh;
  return cost;
}

// 新規：バイセクション法で、目標となる月額電気料金から月間買電量（kWh/月）を逆算する関数
function estimateMonthlyUsageFromCost(targetMonthlyCost) {
  let low = 0;
  let high = 3500; // 十分大きい上限値
  let mid;
  while (high - low > 0.1) {
    mid = (low + high) / 2;
    let cost = calculateMonthlyCost(mid);
    if (cost > targetMonthlyCost) {
      high = mid;
    } else {
      low = mid;
    }





  }
  return (low + high) / 2;
}

// 太陽光＋蓄電池シミュレーション
function calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity) {
  const daytimeRatioMap = {
    "0": 0.273,
    "1": 0.284,
    "2": 0.295,
    "3": 0.306,
    "4": 0.317,
    "5": 0.328,
    "6": 0.339,
    "7": 0.35
  };
  let daytimeUsageRatio = daytimeRatioMap[daytimeDays] || 0.295;
  let dailySolarOutput = panelOutput * 3.15;
  let annualSolarGeneration = dailySolarOutput * 365;
  let availableDaytimeUsage = (annualUsage / 365) * daytimeUsageRatio * 365;

  if (batteryCapacity) {
    // 蓄電池ありの場合：家庭消費、余剰を蓄電池、残りが売電
    let homeConsumption = Math.min(availableDaytimeUsage, annualSolarGeneration);
    let surplus = annualSolarGeneration - homeConsumption;
    let batteryEffectiveCapacity = batteryCapacity * 0.9;
    let batteryAbsorb = Math.min(surplus, batteryEffectiveCapacity * 365);
    let soldEnergy = surplus - batteryAbsorb;
    let effectiveSolarUsage = homeConsumption + batteryAbsorb;
    let effectiveBuyUsage = Math.max(annualUsage - effectiveSolarUsage, 0);
    let solarAnnualCost = calculateElectricityCost(effectiveBuyUsage);
    let noSolarAnnualCost = calculateElectricityCost(annualUsage);
    let savings = noSolarAnnualCost - solarAnnualCost;
    let sellingPrice = getSellingPrice();
    let annualSellIncome = Math.round(soldEnergy * sellingPrice);

    const batterySelect = document.getElementById("battery");
    let batteryText = batterySelect.selectedOptions[0].text;
    if (batteryText.indexOf("OFF GRID WORLD") !== -1) {
      soldEnergy = 0;
      annualSellIncome = 0;
    }

    return {
      noSolarAnnualCost: noSolarAnnualCost,
      solarAnnualCost: solarAnnualCost,
      savings: savings,
      annualSolarUsage: Math.round(homeConsumption),
      dailySolarOutput: parseFloat(dailySolarOutput.toFixed(2)),
      annualSolarSell: Math.round(soldEnergy),
      annualSellIncome: annualSellIncome,
      batteryStored: Math.round(batteryAbsorb),
      effectiveBuyUsage: Math.round(effectiveBuyUsage),
      daytimeUsageRatio: daytimeUsageRatio
    };

  } else {
    // 蓄電池なしの場合：発電の15%は即時売電、残り85%は家庭使用として処理
    let baselineSell = annualSolarGeneration * 0.15;
    let potentialHouseholdUsage = annualSolarGeneration * 0.85;
    let actualHouseholdUsage = Math.min(availableDaytimeUsage, potentialHouseholdUsage);
    let additionalSell = potentialHouseholdUsage - actualHouseholdUsage;
    let finalAnnualSolarSell = baselineSell + additionalSell;
    let sellingPrice = getSellingPrice();
    let annualSellIncome = Math.round(finalAnnualSolarSell * sellingPrice);
    let effectiveBuyUsage = Math.max(annualUsage - actualHouseholdUsage, 0);
    let solarAnnualCost = calculateElectricityCost(effectiveBuyUsage);
    let noSolarAnnualCost = calculateElectricityCost(annualUsage);
    let savings = noSolarAnnualCost - solarAnnualCost;

    return {
      noSolarAnnualCost: noSolarAnnualCost,
      solarAnnualCost: solarAnnualCost,
      savings: savings,
      annualSolarUsage: Math.round(actualHouseholdUsage),
      dailySolarOutput: parseFloat(dailySolarOutput.toFixed(2)),
      annualSolarSell: Math.round(finalAnnualSolarSell),
      annualSellIncome: annualSellIncome,
      batteryStored: 0,
      effectiveBuyUsage: Math.round(effectiveBuyUsage),
      daytimeUsageRatio: daytimeUsageRatio
    };
  }
}

// メインの計算処理
function calculate() {
  if (!pricingData) {
    console.error("pricingData is not loaded yet.");
    return;
  }

  let monthlyUsageMax = parseFloat(document.getElementById("monthlyUsageMax").value) || 0;
  let monthlyUsageMin = parseFloat(document.getElementById("monthlyUsageMin").value) || 0;
  let panelOutput = parseFloat(document.getElementById("panelOutput").value) || 0;
  let daytimeDays = document.getElementById("daytimeDays").value;
  let batterySelect = document.getElementById("battery");

  if (panelOutput < 1 || panelOutput > 25) {
    document.getElementById("result").innerHTML = "<p class=\"error-message\">エラー: パネル容量は1kW～25kWの範囲で入力してください。</p>";
    return;
  }

  let batteryCapacity = 0, batteryCost = 0;
  if (batterySelect.value === "other") {
    batteryCapacity = parseFloat(document.getElementById("batteryOtherCapacity").value) || 0;
    batteryCost = parseInt(document.getElementById("batteryOtherCost").value) || 0;
  } else if (batterySelect.value !== "") {
    batteryCapacity = parseFloat(batterySelect.value) || 0;
    const batteryMapping = {
      "5.12": "OG-BAT512",
      "10.24": "OG-BAT1024",
      "15.36": "OG-BAT1536",
      "3.3": "PDS-1600S03E",
      "12.8": "PDH-6000s01"
    };
    let key = batteryMapping[batterySelect.value];
    batteryCost = pricingData.batteryPrices[key] || 0;
  }

  // パネルの1kW単価の計算（式：165,000 + 145,000 * exp(-0.293*(x-1))）
  let computedUnitPrice = 165000 + 145000 * Math.exp(-0.293 * (panelOutput - 1));

  // チェックボックス「太陽光導入済」の確認
  let solarInstalled = document.getElementById("solarInstalled").checked;
  let computedEquipmentCost = (panelOutput * computedUnitPrice) + batteryCost;
  if (solarInstalled) {
    computedEquipmentCost = batteryCost;
  }

  // 年間電気使用量の決定
  let annualUsage;
  let costInputChecked = document.getElementById("costInputCheckbox").checked;
  if (costInputChecked) {
    // 「電気代から入力」が有効な場合、月最高と月最低の電気料金を使用
    let monthlyCostMax = parseFloat(document.getElementById("monthlyCostMax").value) || 0;
    let monthlyCostMin = parseFloat(document.getElementById("monthlyCostMin").value) || 0;
    if (monthlyCostMax <= 0 || monthlyCostMin <= 0) {
      document.getElementById("result").innerHTML = "<p class=\"error-message\">エラー: 正しい月最高・月最低の電気料金を入力してください。</p>";
      return;
    }
    // 各々から買電量（kWh/月）を逆算し、その平均を求める
    let usageFromMax = estimateMonthlyUsageFromCost(monthlyCostMax);
    let usageFromMin = estimateMonthlyUsageFromCost(monthlyCostMin);
    let monthlyUsage = (usageFromMax + usageFromMin) / 2;
    annualUsage = monthlyUsage * 12;
  } else {
    // 通常は月最高・最低の電気使用量の平均から年間電気使用量を計算
    annualUsage = ((monthlyUsageMax + monthlyUsageMin) / 2) * 12;
  }

  let result = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity);

  // 【通常の場合】
  if (!solarInstalled) {
    let annualTotalSavings = result.savings + result.annualSellIncome;
    let breakEvenYear = null;
    for (let year = 1; year <= 20; year++) {
      if (annualTotalSavings * year >= computedEquipmentCost) {
        breakEvenYear = year;
        break;
      }
    }
    let breakEvenText = breakEvenYear
      ? `元が取れる年数: <strong>${breakEvenYear} 年</strong>`
      : `20年以内に元が取れません`;

    let resultHTML = `
      <p>年間電気使用量: <strong>${annualUsage.toLocaleString()} kWh</strong></p>
      <p>太陽光なしの年間電気料金: <strong>${result.noSolarAnnualCost.toLocaleString()} 円</strong></p>
      <p>太陽光ありの年間電気料金: <strong>${result.solarAnnualCost.toLocaleString()} 円</strong></p>
      <p>節電金額: <strong>${result.savings.toLocaleString()} 円</strong></p>
      <p>家庭で実際に利用される太陽光: <strong>${result.annualSolarUsage.toLocaleString()} kWh</strong></p>
      <p>年間売電量: <strong>${result.annualSolarSell.toLocaleString()} kWh</strong></p>
      <p>年間売電金額: <strong>${result.annualSellIncome.toLocaleString()} 円</strong></p>
      <p>設備導入費用: <strong>${computedEquipmentCost.toLocaleString()} 円</strong></p>
      <p>${breakEvenText}</p>
    `;
    document.getElementById("result").innerHTML = resultHTML;

    let yearsArray = Array.from({ length: 20 }, (_, i) => i + 1);
    let cumulativeSavings = yearsArray.map(y => result.savings * y);
    let cumulativeSellIncome = yearsArray.map(y => result.annualSellIncome * y);

    // デバッグ文字列は非表示
    let debugText = ""; // "【デバッグ】 設備導入費用 = ... " などコメントアウト

    updateGraphPlan2(yearsArray, cumulativeSavings, cumulativeSellIncome, computedEquipmentCost, debugText);

  // 【太陽光導入済の場合】
  } else {
    let resultWithoutBattery = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, 0);
    let batteryEconomicEffect = (result.savings - resultWithoutBattery.savings)
                              - (resultWithoutBattery.annualSellIncome)
                              + (result.annualSellIncome);
    let breakEvenYear = null;
    for (let year = 1; year <= 20; year++) {
      if (batteryEconomicEffect * year >= computedEquipmentCost) {
        breakEvenYear = year;
        break;
      }
    }
    let breakEvenText = breakEvenYear
      ? `元が取れる年数: <strong>${breakEvenYear} 年</strong>`
      : `20年以内に元が取れません`;

    let resultHTML = `
      <p>【太陽光導入済の場合】</p>
      <p>年間電気使用量: <strong>${annualUsage.toLocaleString()} kWh</strong></p>
      <p>太陽光導入済状態での節電金額: <strong>${result.savings.toLocaleString()} 円</strong></p>
      <p>太陽光導入済状態での売電金額: <strong>${result.annualSellIncome.toLocaleString()} 円</strong></p>
      <p>（※比較用）太陽光のみの場合の節電金額: <strong>${resultWithoutBattery.savings.toLocaleString()} 円</strong></p>
      <p>（※比較用）太陽光のみの場合の売電金額: <strong>${resultWithoutBattery.annualSellIncome.toLocaleString()} 円</strong></p>
      <p>蓄電池導入後経済効果（年間）: <strong>${Math.round(batteryEconomicEffect).toLocaleString()} 円</strong></p>
      <p>設備導入費用（バッテリーのみ）: <strong>${computedEquipmentCost.toLocaleString()} 円</strong></p>
      <p>${breakEvenText}</p>
    `;
    document.getElementById("result").innerHTML = resultHTML;

    let yearsArray = Array.from({ length: 20 }, (_, i) => i + 1);
    let cumulativeBatteryEffect = yearsArray.map(y => batteryEconomicEffect * y);

    // デバッグ文字列は非表示
    let debugText = ""; // "【デバッグ】 (太陽光導入済) ... " などコメントアウト

    document.getElementById("graphTitle").innerText = "蓄電池導入後経済効果の累積 vs 設備導入費用";
    updateGraphBatteryEffect(yearsArray, cumulativeBatteryEffect, computedEquipmentCost, debugText);
  }
}
