let economicEffectChart;

function updateGraphPlan2(years, savingsArray, sellIncomeArray, equipmentCost) {
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
              mode: "horizontal",
              scaleID: "y",
              value: equipmentCost,
              borderColor: "red",
              borderWidth: 2,
              label: {
                enabled: true,
                content: "設備導入費用",
                position: "end"
              }
            }
          }
        }
      }
    }
  });
}

function getSellingPrice() {
  return 8.5;
}

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
  let annualBasicFee = contractA === 50 ? annualBasicFee50A : annualBasicFee60A;
  
  return Math.round(annualBasicFee + annualEnergyCost);
}

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
  let annualSolarUsage = Math.min(annualSolarGeneration, availableDaytimeUsage);
  let annualSolarSell = annualSolarGeneration - annualSolarUsage;
  let sellingPrice = getSellingPrice();
  let annualSellIncome = Math.round(annualSolarSell * sellingPrice);
  
  // 蓄電池の影響
  let batteryEffectiveCapacity = batteryCapacity ? batteryCapacity * 0.9 : 0;
  let batteryStored = batteryCapacity ? Math.min(annualSolarSell, batteryEffectiveCapacity * 365) : 0;
  let actualBatteryUsage = batteryStored / 1.03;
  
  let effectiveBuyUsage = Math.max(annualUsage - annualSolarUsage - actualBatteryUsage, 0);
  let solarAnnualCost = calculateElectricityCost(effectiveBuyUsage);
  let noSolarAnnualCost = calculateElectricityCost(annualUsage);
  let savings = noSolarAnnualCost - solarAnnualCost;
  
  let finalAnnualSolarSell = annualSolarSell - batteryStored;
  let finalAnnualSellIncome = Math.round(finalAnnualSolarSell * sellingPrice);
  
  return {
    noSolarAnnualCost: noSolarAnnualCost,
    solarAnnualCost: solarAnnualCost,
    savings: savings,
    annualSolarUsage: Math.round(annualSolarUsage),
    dailySolarOutput: parseFloat(dailySolarOutput.toFixed(2)),
    annualSolarSell: Math.round(finalAnnualSolarSell),
    annualSellIncome: finalAnnualSellIncome,
    batteryStored: Math.round(batteryStored),
    effectiveBuyUsage: Math.round(effectiveBuyUsage),
    daytimeUsageRatio: daytimeUsageRatio
  };
}

document.addEventListener("DOMContentLoaded", function () {
  function updateBatteryOtherInput() {
    const batterySelect = document.getElementById("battery");
    const batteryOtherContainer = document.getElementById("batteryOtherContainer");
    if (batterySelect.value === "other") {
      batteryOtherContainer.style.display = "block";
    } else {
      batteryOtherContainer.style.display = "none";
    }
  }
  
  function calculate() {
    let monthlyUsageMax = parseFloat(document.getElementById("monthlyUsageMax").value) || 0;
    let monthlyUsageMin = parseFloat(document.getElementById("monthlyUsageMin").value) || 0;
    let panelOutput = parseFloat(document.getElementById("panelOutput").value) || 0;
    let daytimeDays = document.getElementById("daytimeDays").value;
    let batterySelect = document.getElementById("battery");
    let batteryCapacity = parseFloat(batterySelect.value) || 0;
    if (batterySelect.value === "other") {
      batteryCapacity = parseFloat(document.getElementById("batteryOther").value) || 0;
    }
    let equipmentCost = parseInt(document.getElementById("equipmentCost").value) || 0;
    
    let annualUsage = ((monthlyUsageMax + monthlyUsageMin) / 2) * 12;
    let result = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity);
    
    let resultHTML = `
      <p>年間電気使用量: <strong>${annualUsage.toLocaleString()} kWh</strong></p>
      <p>太陽光なしの年間電気料金: <strong>${result.noSolarAnnualCost.toLocaleString()} 円</strong></p>
      <p>太陽光ありの年間電気料金: <strong>${result.solarAnnualCost.toLocaleString()} 円</strong></p>
      <p>節電金額: <strong>${result.savings.toLocaleString()} 円</strong></p>
      <p>年間太陽光の電気使用量: <strong>${result.annualSolarUsage.toLocaleString()} kWh</strong></p>
      <p>日中電気使用率 (補正後): <strong>${(result.daytimeUsageRatio * 100).toFixed(2)} %</strong></p>
      <p>日間発電出力: <strong>${result.dailySolarOutput} kWh/日</strong></p>
      <p>年間売電量: <strong>${result.annualSolarSell.toLocaleString()} kWh</strong></p>
      <p>年間売電金額: <strong>${result.annualSellIncome.toLocaleString()} 円</strong></p>
      <p>夜間の買電量: <strong>${result.effectiveBuyUsage.toLocaleString()} kWh</strong></p>
      <p>蓄電池に貯めた量: <strong>${result.batteryStored.toLocaleString()} kWh</strong></p>
    `;
    document.getElementById("result").innerHTML = resultHTML;
    
    let years = Array.from({ length: 20 }, (_, i) => i + 1);
    let cumulativeSavings = years.map(y => result.savings * y);
    let cumulativeSellIncome = years.map(y => result.annualSellIncome * y);
    
    updateGraphPlan2(years, cumulativeSavings, cumulativeSellIncome, equipmentCost);
  }
  
  function updateGraphPlan2(years, savingsArray, sellIncomeArray, equipmentCost) {
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
                value: equipmentCost,
                borderColor: "red",
                borderWidth: 2,
                label: {
                  enabled: true,
                  content: "設備導入費用",
                  position: "end"
                }
              }
            }
          }
        }
      }
    });
  }
  
  document.querySelectorAll("input, select").forEach(input => {
    input.addEventListener("change", () => {
      updateBatteryOtherInput();
      calculate();
    });
    input.addEventListener("input", () => {
      updateBatteryOtherInput();
      calculate();
    });
  });
  
  function updateBatteryOtherInput() {
    const batterySelect = document.getElementById("battery");
    const batteryOtherContainer = document.getElementById("batteryOtherContainer");
    if (batterySelect.value === "other") {
      batteryOtherContainer.style.display = "block";
    } else {
      batteryOtherContainer.style.display = "none";
    }
  }
  
  updateBatteryOtherInput();
  calculate();
});
