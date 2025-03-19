let economicEffectChart;
let pricingData = null;

// prices.json は従来の価格データですが、パネル単価はここでは使用しません
fetch('prices.json')
  .then(response => response.json())
  .then(data => {
    pricingData = data;
    initializeSimulation();
  })
  .catch(error => {
    console.error("Error loading prices.json: ", error);
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

// 初期化処理
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

function updateBatteryOtherInput() {
  const batterySelect = document.getElementById("battery");
  const batteryOtherContainer = document.getElementById("batteryOtherContainer");
  if (batterySelect.value === "other") {
    batteryOtherContainer.style.display = "block";
  } else {
    batteryOtherContainer.style.display = "none";
  }
}

// グラフの更新（従来通り）
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
                backgroundColor: "rgba(255,0,0,0.7)",
                font: { size: 12 }
              }
            }
          }
        }
      }
    }
  });
  document.getElementById("debugEquipmentCost").innerText = debugText;
}

function getSellingPrice() {
  return 8.5;
}

// 電気料金計算モデル（東京電力従量電灯Bに基づく）
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
    monthlyCost = (tier1Limit * tier1Rate) + ((tier2Limit - tier1Limit) * tier2Rate) + ((monthlyUsage - tier2Limit) * tier3Rate);
  }
  monthlyCost -= monthlyUsage * discountPerKwh;
  let annualEnergyCost = monthlyCost * 12;
  
  let contractA = annualUsage < 4200 ? 50 : 60;
  let annualBasicFee = (contractA === 50) ? annualBasicFee50A : annualBasicFee60A;
  
  return Math.round(annualBasicFee + annualEnergyCost);
}

// 太陽光＋蓄電池シミュレーション（蓄電池有無で分岐）
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
  
  // パネル容量の有効範囲チェック（1kW～25kW）
  if (panelOutput < 1 || panelOutput > 25) {
    document.getElementById("result").innerHTML = "<p style='color:red;'>エラー: パネル容量は1kW～25kWの範囲で入力してください。</p>";
    return;
  }
  
  // 蓄電池容量・費用
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
  
  // ※ ここで、パネルの1kW単価を新たな式で計算する
  // 単価(x) = 165,000 + 145,000 * exp(-0.293 * (x - 1))
  let computedUnitPrice = 165000 + 145000 * Math.exp(-0.293 * (panelOutput - 1));
  
  // 設備導入費用＝パネル部分＋蓄電池費用
  let computedEquipmentCost = (panelOutput * computedUnitPrice) + batteryCost;
  
  let annualUsage = ((monthlyUsageMax + monthlyUsageMin) / 2) * 12;
  let result = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity);
  
  // 元が取れる年数の計算（20年間固定）
  let annualTotalSavings = result.savings + result.annualSellIncome;
  let breakEvenYear = null;
  for (let year = 1; year <= 20; year++) {
    if (annualTotalSavings * year >= computedEquipmentCost) {
      breakEvenYear = year;
      break;
    }
  }
  let breakEvenText = breakEvenYear ? `元が取れる年数: <strong>${breakEvenYear} 年</strong>` : `20年以内に元が取れません`;
  
  // 結果出力（パネルの1kW単価も表示）
  let resultHTML = `
    <p>年間電気使用量: <strong>${annualUsage.toLocaleString()} kWh</strong></p>
    <p>太陽光なしの年間電気料金: <strong>${result.noSolarAnnualCost.toLocaleString()} 円</strong></p>
    <p>太陽光ありの年間電気料金: <strong>${result.solarAnnualCost.toLocaleString()} 円</strong></p>
    <p>節電金額: <strong>${result.savings.toLocaleString()} 円</strong></p>
    <p>家庭で実際に利用される太陽光: <strong>${result.annualSolarUsage.toLocaleString()} kWh</strong></p>
    <p>年間売電量: <strong>${result.annualSolarSell.toLocaleString()} kWh</strong></p>
    <p>年間売電金額: <strong>${result.annualSellIncome.toLocaleString()} 円</strong></p>
    <p>パネル1kW当たりの単価: <strong>${Math.round(computedUnitPrice).toLocaleString()} 円</strong></p>
    <p>設備導入費用: <strong>${computedEquipmentCost.toLocaleString()} 円</strong></p>
    <p>${breakEvenText}</p>
  `;
  document.getElementById("result").innerHTML = resultHTML;
  
  let yearsArray = Array.from({ length: 20 }, (_, i) => i + 1);
  let cumulativeSavings = yearsArray.map(y => result.savings * y);
  let cumulativeSellIncome = yearsArray.map(y => result.annualSellIncome * y);
  
  let debugText =
    "【デバッグ】 設備導入費用 = (パネル出力 (" + panelOutput + " kW) × " +
    Math.round(computedUnitPrice).toLocaleString() + " 円/kW) + 蓄電池費用 (" + batteryCost.toLocaleString() +
    " 円) = " + computedEquipmentCost.toLocaleString() + " 円";
  
  updateGraphPlan2(yearsArray, cumulativeSavings, cumulativeSellIncome, computedEquipmentCost, debugText);
}
