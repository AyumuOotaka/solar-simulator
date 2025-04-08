console.log("script.js loaded");

let economicEffectChart;
let pricingData = null;

// --- 初期化 ---
// ページ読み込み時など、適切なタイミングで CSV を読み込み、ルールをセットする
loadSalesCommentRules().then(rules => {
  salesCommentRules = rules;
  verifyRulesCompleteness(salesCommentRules);
});


// ========================
// 固定テーブルを JSON として定義
// ========================
const FIT_RATES = [
  { "Year": 2012, "Under10": 42, "Over10": 40 },
  { "Year": 2013, "Under10": 38, "Over10": 36 },
  { "Year": 2014, "Under10": 37, "Over10": 32 },
  { "Year": 2015, "Under10": 33, "Over10": 29 },
  { "Year": 2016, "Under10": 31, "Over10": 24 },
  { "Year": 2017, "Under10": 28, "Over10": 21 },
  { "Year": 2018, "Under10": 26, "Over10": 18 },
  { "Year": 2019, "Under10": 24, "Over10": 14 },
  { "Year": 2020, "Under10": 21, "Over10": 13 },
  { "Year": 2021, "Under10": 19, "Over10": 12 },
  { "Year": 2022, "Under10": 17, "Over10": 11 },
  { "Year": 2023, "Under10": 16, "Over10": 10 },
  { "Year": 2024, "Under10": 16, "Over10": 10 },
  { "Year": 2025, "Under10": 15, "Over10": 10 }
];

document.addEventListener("DOMContentLoaded", function () {
  const saltAreaRadios = document.querySelectorAll('input[name="saltArea"]');
  const saltAreaNote = document.getElementById("saltAreaNote");

  if (!saltAreaRadios || !saltAreaNote) return;

  saltAreaRadios.forEach((radio) => {
    radio.addEventListener("change", function () {
      if (radio.checked && radio.value.includes("重塩害")) {
        saltAreaNote.textContent = "※場合によっては設置が出来ない事もございます。";
      } else {
        saltAreaNote.textContent = "";
      }
    });
  });
});



// ========================
// 設定項目（税金や税込み処理はなし。額面通りの値を使用）
// ========================
const BASE_FIT_PRICE = 15;  // FIT契約時の基準単価 (税抜)
const POST_FIT_PRICE = 8.5; // FIT終了後の単価
/** ============ イベント: DOMロード完了 ============ **/
window.addEventListener("DOMContentLoaded", function() {
  const costInputCheckbox = document.getElementById("costInputCheckbox");
  const usageContainer     = document.getElementById("usageInputContainer");
  const costContainer      = document.getElementById("costInputContainer");

function validateRange(minId, maxId, errorId) {
  const minInput = document.getElementById(minId);
  const maxInput = document.getElementById(maxId);
  const error = document.getElementById(errorId);

  function check() {
    const min = parseFloat(minInput.value);
    const max = parseFloat(maxInput.value);

    if (!isNaN(min) && !isNaN(max) && max < min) {
      maxInput.setCustomValidity("最大値は最小値以上でなければなりません。");
      error.textContent = "※ 最大値は最小値以上でなければなりません。";
    } else {
      maxInput.setCustomValidity("");
      error.textContent = "";
    }
  }

  minInput.addEventListener("input", check);
  maxInput.addEventListener("input", check);
}

// 実行
validateRange("monthlyUsageMin", "monthlyUsageMax", "usageRangeError");
validateRange("monthlyCostMin", "monthlyCostMax", "costRangeError");

  costInputCheckbox.addEventListener("change", function() {
    if (this.checked) {
      usageContainer.style.display = "none";
      costContainer.style.display  = "flex";
    } else {
      costContainer.style.display  = "none";
      usageContainer.style.display = "flex";
    }
  });

  // 太陽光導入済みかどうかのチェック → 施工年セレクトの表示切替
  const solarInstalledCheckbox = document.getElementById("solarInstalled");
  const solarYearContainer = document.getElementById("solarYearContainer");
  solarInstalledCheckbox.addEventListener("change", () => {
    if (solarInstalledCheckbox.checked) {
      solarYearContainer.style.display = "block";
    } else {
      solarYearContainer.style.display = "none";
    }
    calculate();
  });

  initializeSimulation();
});

// prices.json を読み込み
fetch('prices.json')
  .then(response => response.json())
  .then(data => {
    pricingData = data;
    initializeSimulation();
  })
  .catch(error => {
    console.error("Error loading prices.json: ", error);
    // デフォルト値
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

/**
 * estimateMonthlyUsageFromCost(targetMonthlyCost)
 * 月額電気料金(円)から、月間使用量(kWh)を逆算する。
 * バイセクション法などで「calculateMonthlyCost()」との突き合わせを行う。
 */
function estimateMonthlyUsageFromCost(targetMonthlyCost) {
  let low = 0;
  let high = 3500; // 十分大きい上限値(例: 月3500kWhまで想定)
  while (high - low > 0.1) {
    let mid = (low + high) / 2;
    let cost = calculateMonthlyCost(mid);
    if (cost > targetMonthlyCost) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return (low + high) / 2;
}

/**
 * calculateMonthlyCost(monthlyUsage)
 * 月間従量料金のみ（基本料金は除く）の簡易計算。
 * calculateElectricityCost() とは別で、従量料金のみを算出する関数。
 */
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
  cost -= (monthlyUsage * discountPerKwh);
  return cost;
}


// 蓄電池「その他」入力表示切替
function updateBatteryOtherInput() {
  const batterySelect = document.getElementById("battery");
  const batteryOtherContainer = document.getElementById("batteryOtherContainer");
  if (batterySelect.value === "other") {
    batteryOtherContainer.style.display = "block";
  } else {
    batteryOtherContainer.style.display = "none";
  }
}

function getBaseRate(installationYear, panelOutput) {
  // テーブルから施工年と一致するレコードを検索
  for (let i = 0; i < FIT_RATES.length; i++) {
    if (FIT_RATES[i].Year === installationYear) {
      // パネル容量に応じて Under10 または Over10 を返す
      return (panelOutput < 10) ? FIT_RATES[i].Under10 : FIT_RATES[i].Over10;
    }
  }
  // 見つからなければ、デフォルト値として15円を返す
  return 15;
}


/** 
 * 新規導入の場合のFIT期間
 *   - 10kW未満: 10年
 *   - 10kW以上: 20年
 *   - その後は8.5円
 * 導入済みの場合は、ユーザー入力 year=solarYear
 *   - 10kW未満: 10年 - (現在年 - solarYear)
 *   - 10kW以上: 20年 - (現在年 - solarYear)
 *   - 0以下なら既に終了 → 8.5円
**/
function getSellingPrice(panelOutput) {
  const solarInstalled = document.getElementById("solarInstalled").checked;
  let nowYear = new Date().getFullYear();

  if (!solarInstalled) {
    // 新規導入の場合：施工年は nowYear、FIT期間は10年
    let baseRate = getBaseRate(nowYear, panelOutput);
    return baseRate;
  } else {
    // 導入済みの場合：施工年はユーザー入力の solarYear を使用
    let solarYear = parseInt(document.getElementById("solarYear").value, 10) || nowYear;
    let baseRate = getBaseRate(solarYear, panelOutput);
    let fitYears = 10;  // FIT契約は常に10年
    let passed = nowYear - solarYear;
    if (passed < fitYears) {
      return baseRate;
    } else {
      return 8.5;
    }
  }
}

/** 
 * 例: 1年目～FIT終了年まで → 15円
 *      FIT終了以降 → 8.5円 
 * こうした「年次で売電単価が変わる」場合、calculateSolarImpact() を年ごとにループし、 
 *   i年目発電量×売電単価 + ... 
 * と積み上げるほうが厳密です。
 * ここでは簡易的に「平均売電単価」で概算する方法をとっています。
 */

/** ==================== グラフ描画関数 ==================== **/
function updateGraphPlan2(years, savingsArray, sellIncomeArray, installationCost) {
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
}
function updateGraphBatteryEffects(yearlyResults, installationCost) {
  const ctx = document.getElementById("economicEffectChart").getContext("2d");
  if (economicEffectChart) {
    economicEffectChart.destroy();
  }
  
  // x軸の年度ラベル
  const years = yearlyResults.map(r => r.year);
  // 各年の年間蓄電池効果（batteryEffect）をそのまま配列に
  const annualEffects = yearlyResults.map(r => r.batteryEffect);
  
  // 累積効果：n年目の値 = (n-1年目の累積効果) ；1年目は0
  let cumulativeEffects = [];
  let cum = 0;
  for (let i = 0; i < annualEffects.length; i++) {
    cumulativeEffects.push(cum);
    cum += annualEffects[i];
  }
  
  // 同じ棒グラフ内に2セグメントとして表示（Stacked Bar Chart）
  const datasetCumulative = {
    label: "累積蓄電池効果 (前年度まで)",
    data: cumulativeEffects,
    backgroundColor: "#0D47A1"  // ダークブルー
  };
  
  const datasetAnnual = {
    label: "年間蓄電池効果",
    data: annualEffects,
    backgroundColor: "#2196F3"  // 明るいブルー
  };
  
  economicEffectChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: years,
      datasets: [datasetCumulative, datasetAnnual]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          stacked: true
        },
        y: {
          stacked: true,
          beginAtZero: true
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ": " + context.parsed.y.toLocaleString() + " 円";
            }
          }
        },
        annotation: {
          annotations: {
            equipmentLine: {
              type: "line",
              scaleID: "y",
              value: installationCost,
              borderColor: "#0D47A1",
              borderWidth: 2,
              label: {
                enabled: true,
                content: "設備導入費用: " + installationCost.toLocaleString() + " 円",
                position: "end",
                backgroundColor: "rgba(13, 71, 161, 0.7)",
                font: { size: 12 }
              }
            }
          }
        }
      }
    }
  });
}

function updateGraphDetailed(simulationData, installationCost) {
  const ctx = document.getElementById("economicEffectChart").getContext("2d");
  if (economicEffectChart) {
    economicEffectChart.destroy();
  }
  
  // データセットを用意
  const datasetCumulativeSavings = {
    label: "前年度までの累計節電金額",
    data: simulationData.cumulativeSavings,
    backgroundColor: "#388E3C"  // 濃い緑
  };
  const datasetCurrentSavings = {
    label: "今年の節電金額",
    data: simulationData.yearlySavings,
    backgroundColor: "#81C784"  // 薄い緑
  };
  const datasetCumulativeSell = {
    label: "前年度までの累計売電金額",
    data: simulationData.cumulativeSellIncome,
    backgroundColor: "#FBC02D"  // 濃い黄色
  };
  const datasetCurrentSell = {
    label: "今年の売電金額",
    data: simulationData.yearlySellIncome,
    backgroundColor: "#FFF176"  // 薄い黄色
  };

  economicEffectChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: simulationData.years,
      datasets: [
        datasetCumulativeSavings,
        datasetCurrentSavings,
        datasetCumulativeSell,
        datasetCurrentSell
      ]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return context.dataset.label + ": " + context.parsed.y.toLocaleString() + " 円";
            }
          }
        },
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
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      }
    }
  });
}


function simulateYearlyResults(annualSellEnergy, baseSavings, panelOutput, solarInstalled) {
  const simulationYears = 20;
  const nowYear = new Date().getFullYear();
  let solarYear;
  let fitYears;
  let baseRate; // 基準単価（施工年に応じた値）
  let yearlySellIncome = []; // 各年の売電金額
  let yearlySavings = [];     // 各年の節電金額（一定）
  
  if (!solarInstalled) {
    // 新規導入の場合：施工年 = nowYear, FITは10年
    solarYear = nowYear;
    fitYears = 10;
    baseRate = getBaseRate(nowYear, panelOutput);
    for (let i = 1; i <= simulationYears; i++) {
      let price = (i <= fitYears) ? baseRate : 8.5;
      yearlySellIncome.push(Math.round(annualSellEnergy * price));
      yearlySavings.push(baseSavings);
    }
  } else {
    // 導入済みの場合：施工年はユーザー入力
    solarYear = parseInt(document.getElementById("solarYear").value, 10) || nowYear;
    // FIT期間は常に10年（10kW未満の場合）としてシミュレーション
    fitYears = 10;
    baseRate = getBaseRate(solarYear, panelOutput);
    let passed = nowYear - solarYear;
    for (let i = 1; i <= simulationYears; i++) {
      let effectiveRemaining = fitYears - (passed + i - 1);
      let price = (effectiveRemaining > 0) ? baseRate : 8.5;
      yearlySellIncome.push(Math.round(annualSellEnergy * price));
      yearlySavings.push(baseSavings);
    }
  }
  
  // 累積配列の生成
  let cumulativeSavings = [];
  let cumulativeSellIncome = [];
  let sumSavings = 0;
  let sumSellIncome = 0;
  for (let i = 0; i < simulationYears; i++) {
    cumulativeSavings.push(sumSavings);
    cumulativeSellIncome.push(sumSellIncome);
    sumSavings += yearlySavings[i];
    sumSellIncome += yearlySellIncome[i];
  }
  
  return {
    years: Array.from({length: simulationYears}, (_, i) => i + 1),
    yearlySavings: yearlySavings,
    yearlySellIncome: yearlySellIncome,
    cumulativeSavings: cumulativeSavings,
    cumulativeSellIncome: cumulativeSellIncome
  };
}

/**
 * 20年間の各年度ごとのシミュレーション結果を算出する関数
 * （蓄電池あり／なしそれぞれのシナリオと、バッテリー追加による効果 batteryEffect を計算）
 */
/**
 * 20年間の各年度ごとのシミュレーション結果を算出する関数
 * （蓄電池あり／なしそれぞれのシナリオと、バッテリー追加による効果 batteryEffect を計算）
 */
function simulateYearlyBatteryEffects(annualUsage, panelOutput, daytimeDays, batteryCapacity, solarInstalled) {
  const simulationYears = 20;
  const nowYear = new Date().getFullYear();
  // 太陽光導入済みの場合、ユーザー入力の施工年を使用。未導入なら現在の年を使用。
  let solarYear = solarInstalled ? (parseInt(document.getElementById("solarYear").value, 10) || nowYear) : nowYear;
  // 基準となる FIT 単価（施工年または現在の年から算出）
  let baseRate = getBaseRate(solarInstalled ? solarYear : nowYear, panelOutput);
  let passed = solarInstalled ? (nowYear - solarYear) : 0;
  
  let yearlyResults = [];
  
  for (let i = 1; i <= simulationYears; i++) {
    // 各年度ごとの FIT 単価計算
    let effectiveRemaining = 10 - (passed + i - 1);
    let fitPrice = (effectiveRemaining > 0) ? baseRate : POST_FIT_PRICE;
    
    // 蓄電池ありシナリオの計算
    let baseResult = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity);
    // 年ごとの売電収入は、FIT単価を乗じて再計算
    baseResult.annualSellIncome = Math.round(baseResult.annualSellEnergy * fitPrice);
    
    // 蓄電池なしシナリオの計算
    let resultNoBattery = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, 0);
    resultNoBattery.annualSellIncome = Math.round(resultNoBattery.annualSellEnergy * fitPrice);
    
    // バッテリー効果（その年度ごとの差分）
    let batteryEffect = (baseResult.savings - resultNoBattery.savings)
                        - resultNoBattery.annualSellIncome
                        + baseResult.annualSellIncome;
    
    yearlyResults.push({
      year: i,
      fitPrice: fitPrice,
      batterySavings: baseResult.savings,
      noBatterySavings: resultNoBattery.savings,
      batterySellIncome: baseResult.annualSellIncome,
      noBatterySellIncome: resultNoBattery.annualSellIncome,
      batteryEffect: batteryEffect
    });
  }
  
  return yearlyResults;
}

/** ==================== ラベル化 & コメント生成 ==================== **/
function getE1Label(val) {
  if (val <= -35) return "W";
  if (val < 0)    return "B";
  if (val < 15)   return "N";
  return "G";
}
function getE2Label(val) {
  if (val <= -10) return "W";
  if (val < 0)    return "B";
  if (val < 5)    return "N";
  return "G";
}
function getE3Label(val) {
  if (val <= -25) return "W";
  if (val < 0)    return "B";
  if (val < 10)   return "N";
  return "G";
}
function getE4Label(val) {
  if (val <= -25) return "W";
  if (val < 0)    return "B";
  if (val < 10)   return "N";
  return "G";
}
const E1_texts = {
  G: "回収期間が短い",
  N: "回収期間は平均的",
  B: "回収期間が長め",
  W: "回収期間が極端に長い"
};
const E2_texts = {
  G: "初期費用が安い",
  N: "初期費用は平均的",
  B: "初期費用が高い",
  W: "初期費用が非常に高い"
};
const E3_texts = {
  G: "年間経済効果が大きい",
  N: "年間経済効果は平均的",
  B: "年間経済効果が小さい",
  W: "年間経済効果はほぼ見込めない"
};
const E4_texts = {
  G: "電気代削減割合が高い",
  N: "電気代削減割合は平均的",
  B: "電気代削減割合が低い",
  W: "電気代はほとんど削減できない"
};

// --- Evaluate.csv のルールを読み込む処理 ---
// グローバル変数としてルールを保持
let salesCommentRules = [];

// CSVファイル "Evaluate.csv" を読み込む関数
function loadSalesCommentRules() {
  return fetch('Evaluate.csv')
    .then(response => response.text())
    .then(text => {
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const rules = [];
      // ヘッダー行がある場合は1行目をスキップ（ヘッダーに「通し番号」などが含まれている前提）
      const startIdx = lines[0].includes("通し番号") ? 1 : 0;
      for (let i = startIdx; i < lines.length; i++) {
        // 単純にカンマで分割（※内部にカンマが含まれない前提）
        const parts = lines[i].split(',');
        if (parts.length < 6) continue;
        rules.push({
          row: parseInt(parts[0].trim(), 10),
          g: parts[1].trim(),
          n: parts[2].trim(),
          b: parts[3].trim(),
          w: parts[4].trim(),
          comment: parts[5].trim()
        });
      }
      // 通し番号が若い順にソート
      rules.sort((a, b) => a.row - b.row);
      return rules;
    })
    .catch(err => {
      console.error("Evaluate.csv の読み込みに失敗しました:", err);
      return [];
    });
}

// --- 条件チェック用関数 ---
// 条件文字列 (例："*", ">=1", "2" など) と実際のカウントを照合
function conditionMatches(cond, count) {
  cond = cond.trim();
  if (cond === "*" || cond === "*?") {
    return true;
  } else if (cond.startsWith(">=")) {
    let num = parseInt(cond.substring(2).trim(), 10);
    return count >= num;
  } else {
    return count === parseInt(cond, 10);
  }
}

// --- ルール網羅性検証 ---
// 4項目（G, N, B, W の合計が4）の全組み合わせについて、少なくとも1つのルールにマッチするかチェック
function verifyRulesCompleteness(rules) {
  let combinations = [];
  // g+n+b+w=4 となるすべての組み合わせを生成（各評価のカウントは 0～4）
  for (let g = 0; g <= 4; g++) {
    for (let n = 0; n <= 4 - g; n++) {
      for (let b = 0; b <= 4 - g - n; b++) {
        let w = 4 - g - n - b;
        combinations.push({ g, n, b, w });
      }
    }
  }
  let uncovered = [];
  combinations.forEach(combo => {
    let matched = rules.some(rule =>
      conditionMatches(rule.g, combo.g) &&
      conditionMatches(rule.n, combo.n) &&
      conditionMatches(rule.b, combo.b) &&
      conditionMatches(rule.w, combo.w)
    );
    if (!matched) {
      uncovered.push(combo);
    }
  });
  if (uncovered.length > 0) {
    console.warn("以下の評価組み合わせ (G, N, B, W の数) がルールで網羅されていません:", uncovered);
  } else {
    //console.log("すべての評価組み合わせがルールで網羅されています。");
  }
}

// --- 新しい generateSalesComment 関数 ---
// ※ getE1Label, getE2Label, getE3Label, getE4Label および E1_texts～E4_texts は既存の実装を利用
function generateSalesComment(e1, e2, e3, e4) {
  // 各評価値からラベル (G, N, B, W) を取得
  const L1 = getE1Label(e1);
  const L2 = getE2Label(e2);
  const L3 = getE3Label(e3);
  const L4 = getE4Label(e4);

  const ratings = [L1, L2, L3, L4];
  const countG = ratings.filter(x => x === "G").length;
  const countN = ratings.filter(x => x === "N").length;
  const countB = ratings.filter(x => x === "B").length;
  const countW = ratings.filter(x => x === "W").length;

  // 各項目の詳細コメント（既存のテキスト定義を使用）
  const partE1 = E1_texts[L1];
  const partE2 = E2_texts[L2];
  const partE3 = E3_texts[L3];
  const partE4 = E4_texts[L4];
  const baseComment = [partE1, partE2, partE3, partE4].join("、") + "、という状況で、";

  // ルール配列から、条件を満たす最初のルールを若い通し番号順に選択
  let selectedRule = null;
  for (let rule of salesCommentRules) {
    if (
      conditionMatches(rule.g, countG) &&
      conditionMatches(rule.n, countN) &&
      conditionMatches(rule.b, countB) &&
      conditionMatches(rule.w, countW)
    ) {
      selectedRule = rule;
      break;
    }
  }

  // マッチするルールがなければデフォルトのコメント
  const finalSentence = selectedRule ? selectedRule.comment : "評価に基づく明確な判断ができません。";
  return baseComment + finalSentence;
}

/** ==================== 電気料金 & 売電関連計算ロジック ==================== **/
/**
 * calculateElectricityCost(annualUsage)
 * 東京電力従量電灯Bモデル（例）に基づき、年間の電気料金を算出する関数。
 * annualUsage: 年間電気使用量 (kWh)
 * 戻り値: 年間電気料金 (円)
 */
function calculateElectricityCost(annualUsage) {
  // 月の基本料金（50A/60A）を仮に4200kWh/年で切り替え
  const basicFee50A = 1558.75;  // 50Aの月額基本料金
  const basicFee60A = 1870.50;  // 60Aの月額基本料金
  const annualBasicFee50A = basicFee50A * 12;
  const annualBasicFee60A = basicFee60A * 12;

  // 従量料金の3段階
  const tier1Limit = 120;
  const tier2Limit = 300;
  const tier1Rate = 29.3;
  const tier2Rate = 36.4;
  const tier3Rate = 40.49;
  // 燃料費調整額や再エネ賦課金は省略例
  // 一部割引
  const discountPerKwh = 3.0;

  // 月平均使用量
  let monthlyUsage = annualUsage / 12;
  let monthlyCost = 0;

  // 1段階,2段階,3段階の従量料金を計算
  if (monthlyUsage <= tier1Limit) {
    monthlyCost = monthlyUsage * tier1Rate;
  } else if (monthlyUsage <= tier2Limit) {
    monthlyCost = (tier1Limit * tier1Rate)
                + ((monthlyUsage - tier1Limit) * tier2Rate);
  } else {
    monthlyCost = (tier1Limit * tier1Rate)
                + ((tier2Limit - tier1Limit) * tier2Rate)
                + ((monthlyUsage - tier2Limit) * tier3Rate);
  }

  // 割引を適用
  monthlyCost -= (monthlyUsage * discountPerKwh);

  // 年間の従量料金
  let annualEnergyCost = monthlyCost * 12;

  // 契約アンペア(50A or 60A)を仮に4200kWh/年で切り替え
  let contractA = (annualUsage < 4200) ? 50 : 60;
  let annualBasicFee = (contractA === 50) ? annualBasicFee50A : annualBasicFee60A;

  let total = annualBasicFee + annualEnergyCost;

  // デバッグログ（必要に応じてコメントアウト）
  // console.log("[DEBUG] calculateElectricityCost => annualUsage:", annualUsage, " => total:", total);

  return Math.round(total);
}

function simulateAverageSellIncome(totalSellEnergy, panelOutput, solarInstalled) {
  const simulationYears = 20;
  const nowYear = new Date().getFullYear();
  let totalIncome = 0;
  
  if (!solarInstalled) {
    // 新規導入の場合：施工年 = nowYear, FIT期間は10年固定
    let fitYears = 10;
    let baseRate = getBaseRate(nowYear, panelOutput);
    for (let i = 1; i <= simulationYears; i++) {
      let sellPrice = (i <= fitYears) ? baseRate : POST_FIT_PRICE;
      totalIncome += totalSellEnergy * sellPrice;
    }
  } else {
    // 導入済みの場合：施工年はユーザー入力の solarYear を使用
    let solarYear = parseInt(document.getElementById("solarYear").value, 10) || nowYear;
    let fitYears = 10;
    let baseRate = getBaseRate(solarYear, panelOutput);
    let passed = nowYear - solarYear;
    for (let i = 1; i <= simulationYears; i++) {
      let effectiveRemaining = fitYears - (passed + i - 1);
      let sellPrice = (effectiveRemaining > 0) ? baseRate : POST_FIT_PRICE;
      totalIncome += totalSellEnergy * sellPrice;
    }
  }
  
  return Math.round(totalIncome / simulationYears);
}


function calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity) {
  const solarInstalled = document.getElementById("solarInstalled").checked;
  const daytimeRatioMap = {
    "0": 0.273, "1": 0.284, "2": 0.295, "3": 0.306,
    "4": 0.317, "5": 0.328, "6": 0.339, "7": 0.35
  };
  let daytimeUsageRatio = daytimeRatioMap[daytimeDays] || 0.295;
  let dailySolarOutput = panelOutput * 3.15;
  let annualSolarGeneration = dailySolarOutput * 365;

  // ----- 全量買取モード (10kW以上 & 導入済み) -----
  if (solarInstalled && panelOutput >= 10) {
    let noSolarAnnualCost = calculateElectricityCost(annualUsage);
    // 全量売電: 発電量全てを売電対象とする
    let annualSellEnergy = annualSolarGeneration;
    let avgSellIncome = simulateAverageSellIncome(annualSolarGeneration, panelOutput, solarInstalled);
    return {
      noSolarAnnualCost: noSolarAnnualCost,
      solarAnnualCost: noSolarAnnualCost, // 節電効果なし
      savings: 0,
      annualSolarUsage: 0,
      annualSellEnergy: annualSellEnergy,
      dailySolarOutput: parseFloat(dailySolarOutput.toFixed(2)),
      annualSellIncome: avgSellIncome
    };
  }

  // ----- 蓄電池ありモード -----
  if (batteryCapacity > 0) {
    let availableDaytimeUsage = (annualUsage / 365) * daytimeUsageRatio * 365;
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
    let annualSellEnergy = soldEnergy;  // 売電対象エネルギー
    const batterySelect = document.getElementById("battery");
    let batteryText = batterySelect.selectedOptions[0].text || "";
    if (batteryText.indexOf("OFF GRID WORLD") >= 0) {
      annualSellEnergy = 0;
    }
    let avgSellIncome = simulateAverageSellIncome(annualSellEnergy, panelOutput, solarInstalled);
    return {
      noSolarAnnualCost: noSolarAnnualCost,
      solarAnnualCost: solarAnnualCost,
      savings: savings,
      annualSolarUsage: Math.round(homeConsumption),
      annualSellEnergy: annualSellEnergy,
      dailySolarOutput: parseFloat(dailySolarOutput.toFixed(2)),
      annualSellIncome: avgSellIncome
    };
  }

  // ----- 蓄電池なしモード -----
  let availableDaytimeUsage = (annualUsage / 365) * daytimeUsageRatio * 365;
  let baselineSell = annualSolarGeneration * 0.15;
  let potentialHouseholdUsage = annualSolarGeneration * 0.85;
  let actualHouseholdUsage = Math.min(availableDaytimeUsage, potentialHouseholdUsage);
  let additionalSell = potentialHouseholdUsage - actualHouseholdUsage;
  let finalAnnualSolarSell = baselineSell + additionalSell;
  let noSolarAnnualCost = calculateElectricityCost(annualUsage);
  let effectiveBuyUsage = Math.max(annualUsage - actualHouseholdUsage, 0);
  let solarAnnualCost = calculateElectricityCost(effectiveBuyUsage);
  let savings = noSolarAnnualCost - solarAnnualCost;
  let annualSellEnergy = finalAnnualSolarSell;
  let avgSellIncome = simulateAverageSellIncome(annualSellEnergy, panelOutput, solarInstalled);
  
  return {
    noSolarAnnualCost: noSolarAnnualCost,
    solarAnnualCost: solarAnnualCost,
    savings: savings,
    annualSolarUsage: Math.round(actualHouseholdUsage),
    annualSellEnergy: annualSellEnergy,
    dailySolarOutput: parseFloat(dailySolarOutput.toFixed(2)),
    annualSellIncome: avgSellIncome
  };
}



/** ============ メイン計算関数 ============ **/
/**
 * メインの計算処理。
 * フォームの入力値を取得し、設備導入費用やシミュレーション結果を算出。
 * 回収期間やお勧め度を計算し、画面に表示する。
 */
function calculate() {
  if (!pricingData) {
    console.error("pricingData is not loaded yet.");
    return;
  }


  // 1) 入力値の取得
  const monthlyUsageMax = parseFloat(document.getElementById("monthlyUsageMax").value) || 0;
  const monthlyUsageMin = parseFloat(document.getElementById("monthlyUsageMin").value) || 0;
  const panelOutput     = parseFloat(document.getElementById("panelOutput").value) || 0;
  const daytimeDays     = document.getElementById("daytimeDays").value;
  const batterySelect   = document.getElementById("battery");
  const solarInstalled  = document.getElementById("solarInstalled").checked;

  if (panelOutput < 1 || panelOutput > 25) {
    document.getElementById("result").innerHTML =
      '<p class="error-message">エラー: パネル容量は1kW～25kWの範囲で入力してください。</p>';
    return;
  }

  // 2) 蓄電池の値取得
  let batteryCapacity = 0, batteryCost = 0;
  if (batterySelect.value === "other") {
    batteryCapacity = parseFloat(document.getElementById("batteryOtherCapacity").value) || 0;
    batteryCost     = parseInt(document.getElementById("batteryOtherCost").value) || 0;
  } else if (batterySelect.value !== "") {
    if (batterySelect.value.includes("|")) {
      const parts = batterySelect.value.split("|");
      const manufacturer = parts[0].trim();
      batteryCapacity = parseFloat(parts[1].trim()) || 0;
      batteryCost     = pricingData.batteryPrices[manufacturer] || 0;
    } else {
      batteryCapacity = parseFloat(batterySelect.value) || 0;
      const batteryMapping = {
        "5.12": "OG-BAT512",
        "10.24": "OG-BAT1024",
        "15.36": "OG-BAT1536",
        "3.3":   "PDS-1600S03E",
        "12.8":  "PDH-6000s01"
      };
      const key = batteryMapping[batterySelect.value];
      batteryCost = pricingData.batteryPrices[key] || 0;
    }
  }

  // 3) 年間電気使用量 (kWh)
  let annualUsage = 0;
  const costInputChecked = document.getElementById("costInputCheckbox").checked;
  if (costInputChecked) {
    const monthlyCostMax = parseFloat(document.getElementById("monthlyCostMax").value) || 0;
    const monthlyCostMin = parseFloat(document.getElementById("monthlyCostMin").value) || 0;
    if (monthlyCostMax <= 0 || monthlyCostMin <= 0) {
      document.getElementById("result").innerHTML =
        '<p class="error-message">エラー: 正しい月最高・月最低の電気料金を入力してください。</p>';
      return;
    }
    const usageFromMax = estimateMonthlyUsageFromCost(monthlyCostMax);
    const usageFromMin = estimateMonthlyUsageFromCost(monthlyCostMin);
    const monthlyUsage = (usageFromMax + usageFromMin) / 2;
    annualUsage = monthlyUsage * 12;
  } else {
    annualUsage = ((monthlyUsageMax + monthlyUsageMin) / 2) * 12;
  }

  // 4) パネル費用計算（二次式）
  const sqrtTerm = Math.sqrt(0.25 + 0.02 * (0.1 + panelOutput));
  const x_val = (-0.5 + sqrtTerm) / (2 * 0.005);
  const panelCost = x_val * 100000;

  // 5) パネル施工費 (200,000円ごと増加)
  let panelInstallationFee = 0;
  if (batteryCapacity <= 0) {
    let units = 0;
    if (panelOutput <= 6.5) { units = 1; }
    else if (panelOutput <= 11.5) { units = 2; }
    else if (panelOutput <= 16.5) { units = 3; }
    else if (panelOutput <= 21.5) { units = 4; }
    else { units = 5; }
    panelInstallationFee = units * 200000;
  }

  // 6) 蓄電池施工費 +250,000円
  if (batteryCapacity > 0) {
    batteryCost += 250000;
  }

  // 7) 設備導入費用
  let computedEquipmentCost = 0;
  if (solarInstalled) {
    // 既に太陽光導入済 → パネル費用不要
    computedEquipmentCost = batteryCost;
  } else {
    if (batteryCapacity > 0) {
      computedEquipmentCost = panelCost + batteryCost;
    } else {
      computedEquipmentCost = panelCost + panelInstallationFee;
    }
  }

  // 8) シミュレーション結果（年間節電金額、年間売電エネルギー）を取得
  // 詳細情報は1年目の値を使用
  const baseResult = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, batteryCapacity);
  const detailedSavings = baseResult.savings;         // 1年目の節電金額
  const annualSellEnergy = baseResult.annualSellEnergy; // 1年目の売電エネルギー（kWh）

  // 9) 年次シミュレーション結果（グラフ用）は年次計算
  const simulationData = simulateYearlyResults(annualSellEnergy, detailedSavings, panelOutput, solarInstalled);

  // 10) グラフ描画（updateGraphDetailed() を使用）
if (solarInstalled && batteryCapacity > 0) {
  // 蓄電池導入の場合は、20年間の batteryEffect を算出し、蓄電池効果グラフを描画
  let yearlyBatteryEffects = simulateYearlyBatteryEffects(annualUsage, panelOutput, daytimeDays, batteryCapacity, solarInstalled);
  updateGraphBatteryEffects(yearlyBatteryEffects, computedEquipmentCost);
} else {
  // それ以外は従来のグラフ描画（詳細シミュレーション結果）
  updateGraphDetailed(simulationData, computedEquipmentCost);
}

  // 11) 詳細シミュレーション結果の表示（1年目の値を使用）
  let resultHTML = `<h3>詳細シミュレーション結果</h3>`;

  
  resultHTML += `
    <div id="summaryView" class="simulation-summary">
        <div class="highlight-line large-highlight">
          <span class="label">📌 元が取れる年数</span>
          <span class="value" id="paybackYears">- 年</span>
        </div>
        <div class="highlight-line large-highlight">
          <span class="label">🟢 おすすめ度</span>
          <span class="value" id="recommendPercent">- %</span>
        </div>
      <div class="section-block">
        <h4>【電気料金の比較】</h4>
        <ul>
          <li>🟥 太陽光なしの年間電気料金　：<span id="electricNoSolar">- 円</span></li>
          <li>🟩 太陽光ありの年間電気料金　：<span id="electricWithSolar">- 円</span></li>
          <li>💰 節電金額　　　　　　　　　：<span id="savingAmount">- 円</span></li>
        </ul>
      </div>
      <div class="section-block">
        <h4>【売電情報】</h4>
        <ul>
          <li>🔋 年間売電金額　　　　 　　：<span id="sellIncome">- 円</span></li>
        </ul>
      </div>
      <div class="section-block">
        <h4>【設備投資】</h4>
        <ul>
          <li>🏗️ 導入費用　　　　　　　　：<span id="equipmentCost">- 万円</span></li>
          <li>📈 回収年数　　　　　　　　：<span id="paybackYears2">- 年</span></li>
        </ul>
      </div>
    </div>
  `;

  // 回収期間の算出（従来のロジック）
  let breakEvenYear = null;
  if (!solarInstalled) {
    const annualTotalSavings = detailedSavings + simulationData.yearlySellIncome[0]; // 1年目の合計
    for (let y = 1; y <= 20; y++) {
      if (annualTotalSavings * y >= computedEquipmentCost) {
        breakEvenYear = y;
        break;
      }
    }
  } else {
    // 既存の太陽光導入済の場合は、バッテリーなしのシナリオも計算する
    const resultNoBattery = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, 0);
    const batteryEffect = (baseResult.savings - resultNoBattery.savings)
                        - resultNoBattery.annualSellIncome
                        + baseResult.annualSellIncome;
    for (let y = 1; y <= 20; y++) {
      if (batteryEffect * y >= computedEquipmentCost) {
        breakEvenYear = y;
        break;
      }
    }
    // デバッグ情報の追加（このブロック内なら resultNoBattery は定義済み）
    /* debugInfoで蓄電池のデバッグ出力。
    resultHTML += `<div id="debugInfo" style="margin-top:20px; padding:10px; background:#eef; border:1px solid #99c;">
      <h3>デバッグ情報 (蓄電池追加時)</h3>
      <pre>resultNoBattery: ${JSON.stringify(resultNoBattery, null, 2)}</pre>
      <pre>baseResult: ${JSON.stringify(baseResult, null, 2)}</pre>
      <pre>batteryEffect: ${batteryEffect}</pre>
    </div>`;
    */
  }
  const breakEvenText = (breakEvenYear)
    ? `元が取れる年数: <strong>${breakEvenYear} 年</strong>`
    : `20年以内に元が取れません`;

  // ----- お勧め度評価（従来の評価ロジック） -----
  let batteryInstalledFlag = (batteryCapacity > 0);
  let rec_E1 = 0;
  if (!breakEvenYear) {
    rec_E1 = -35;
  } else {
    rec_E1 = (!batteryInstalledFlag)
      ? -0.03 * Math.pow(breakEvenYear, 2) - 4.5 * breakEvenYear + 60
      : -0.03 * Math.pow(breakEvenYear, 2) - 4 * breakEvenYear + 70;
  }
  rec_E1 = Math.max(-35, Math.min(35, rec_E1));

  let costFactor = computedEquipmentCost / 100000;
  let rec_E2 = -0.01 * Math.pow(costFactor, 2) - 0.05 * costFactor + 11.2;
  rec_E2 = Math.max(-10, Math.min(10, rec_E2));

  // 平均売電金額を取得
let avgSellIncome = simulateAverageSellIncome(baseResult.annualSellEnergy, panelOutput, solarInstalled);

// ---------------------------
// 年間経済効果（節電＋売電）
const annualTotalEffect = detailedSavings + avgSellIncome;

// 導入前の年間電気代
const preSolarAnnualCost = baseResult.noSolarAnnualCost;

// ---------------------------
// ① 経験値ベース（10点スケーリング）
// ---------------------------
const x3_legacy = annualTotalEffect / 10000;

let raw_legacy_score = (x3_legacy <= 0)
  ? -25
  : (0.01 * Math.pow(x3_legacy, 2) - (500 / (x3_legacy + 8)) + 32);  // 修正ポイント
raw_legacy_score = Math.max(-25, Math.min(25, raw_legacy_score));
const rec_E3_legacy_scaled = raw_legacy_score * (10 / 25);

// ---------------------------
// ② 電気代カバー率ベース（15点）
// ---------------------------
function getRatioScoreHybridFromEffect(effect, baselineCost) {
  if (baselineCost <= 0) return -15;
  const x = effect / baselineCost;

  if (x <= 0.4) {
    return Math.max(-15, 75 * (x - 0.2) - 15);  // 線形セクション
  } else {
    const offsetA = x - 0.2;  // 修正：3次項の基準
    const offsetB = x - 0.4;  // 修正：16.53項の基準は変わらず
    return Math.min(15, 10 * Math.pow(offsetA, 3) + 16.53 * offsetB);
  }
}

const rec_E3_ratio_scaled = getRatioScoreHybridFromEffect(annualTotalEffect, preSolarAnnualCost);

// ---------------------------
// ③ 合計スコア（最大25点）
// ---------------------------
const rec_E3 = rec_E3_legacy_scaled + rec_E3_ratio_scaled;

// ---------------------------
// ✅ デバッグ出力
// ---------------------------
/* E3のデバッグ出力
console.log("【E3デバッグ】");
console.log("経験値ベース (E3 legacy):", rec_E3_legacy_scaled.toFixed(2), "/10");
console.log("電気代カバー率ベース (E3 ratio):", rec_E3_ratio_scaled.toFixed(2), "/15");
console.log("最終合計スコア (rec_E3):", rec_E3.toFixed(2), "/25");
*/

  const basicFee = (annualUsage < 4200) ? 1558.75 * 12 : 1870.50 * 12;
  let preElectricity = baseResult.noSolarAnnualCost - basicFee;
  let postElectricity = baseResult.solarAnnualCost - basicFee;
  let reductionRatio = (preElectricity !== 0) ? ((preElectricity - postElectricity) / preElectricity) * 100 : 0;
  let rec_E4 = 0;
  if (!batteryInstalledFlag) {
    rec_E4 = 0.0038 * Math.pow(reductionRatio, 2) - (2000 / (reductionRatio + 20)) + 40;
  } else {
    rec_E4 = 0.00125 * Math.pow(reductionRatio, 2) - (2000 / (reductionRatio + 20)) + 33;
  }
  rec_E4 = Math.max(-25, Math.min(25, rec_E4));

  let recommendedDegree = 50 + rec_E1 + rec_E2 + rec_E3 + rec_E4;
  const salesComment = generateSalesComment(rec_E1, rec_E2, rec_E3, rec_E4);

let recommendationHTML = `
  <hr>
  <p><strong>【お勧め度】</strong> ${Math.round(recommendedDegree)} %</p>
  <p><strong>【評価詳細】</strong></p>
  <ul>
    <li>回収期間の評価: ${rec_E1.toFixed(1)} % <span class="maxScore">(±35%)</span></li>
    <li>初期費用の評価: ${rec_E2.toFixed(1)} % <span class="maxScore">(±10%)</span></li>
    <li>年間経済効果の評価: ${rec_E3.toFixed(1)} % <span class="maxScore">(±25%)</span></li>
    <li>電気代削減割合の評価: ${rec_E4.toFixed(1)} % <span class="maxScore">(±25%)</span></li>
  </ul>
  <p><strong>【営業部コメント】</strong></p>
<!-- 営業部コメント全体を囲むコンテナ -->
<div class="sales-comments">
  <!-- 営業担当１の吹き出し -->
  <div class="sales-comment">
    <div class="sales-icons">
      <img src="sales_icon1.png" alt="営業担当1" class="sales-icon">
    </div>
    <div class="speech-bubble">
      <p class="sales-explanation">
        お勧め度は60%が平均的。80%を超えたらかなり良くて、100%オーバーは自信を持って提案できます！
      </p>
    </div>
  </div>
  
  <!-- 営業担当２の吹き出し -->
  <div class="sales-comment">
    <div class="sales-icons">
      <img src="sales_icon2.png" alt="営業担当2" class="sales-icon">
    </div>
    <div class="speech-bubble">
      <p class="sales-comment-text">
        ${salesComment}
      </p>
    </div>
  </div>
</div>

`;

  resultHTML += recommendationHTML;

  document.getElementById("result").innerHTML = resultHTML;

  try {
    const summaryValues = {
      paybackYears: breakEvenYear + "年",
      paybackYears2: breakEvenYear + "年",
      recommendPercent: Math.round(recommendedDegree) + "%",
      electricNoSolar: baseResult.noSolarAnnualCost.toLocaleString() + " 円",
      electricWithSolar: baseResult.solarAnnualCost.toLocaleString() + " 円",
      savingAmount: detailedSavings.toLocaleString() + " 円",
      sellIncome: simulationData.yearlySellIncome[0].toLocaleString() + " 円",
      equipmentCost: Math.round(computedEquipmentCost / 1000) / 10 + " 万円"
    };
    for (const id in summaryValues) {
      const el = document.getElementById(id);
      if (el) el.textContent = summaryValues[id];
    }
  } catch (e) {
    console.error("summaryViewの代入エラー:", e);
  }

  try {
    const summaryValues = {
      paybackYears: breakEvenYear + "年",
      paybackYears2: breakEvenYear + "年",
      recommendPercent: Math.round(recommendedDegree) + "%",
      electricNoSolar: baseResult.noSolarAnnualCost.toLocaleString() + " 円",
      electricWithSolar: baseResult.solarAnnualCost.toLocaleString() + " 円",
      savingAmount: detailedSavings.toLocaleString() + " 円",
      sellIncome: simulationData.yearlySellIncome[0].toLocaleString() + " 円",
      equipmentCost: Math.round(computedEquipmentCost / 1000) / 10 + " 万円"
    };
    for (const id in summaryValues) {
      const el = document.getElementById(id);
      if (el) el.textContent = summaryValues[id];
    }
  } catch (e) {
    console.error("summaryView代入エラー:", e);
  }

/* rec_E(x)のデバッグ
  console.log("Detailed Simulation Data (Year 1):", baseResult);
  console.log("breakEvenYear:", breakEvenYear);
  console.log("rec_E1:", rec_E1, " rec_E2:", rec_E2, " rec_E3:", rec_E3, " rec_E4:", rec_E4);
  console.log("recommendedDegree:", recommendedDegree);
}
*/

document.addEventListener("DOMContentLoaded", () => {
  const btnResult = document.getElementById("floatingScrollButton");
  const btnEstimate = document.getElementById("floatingEstimateButton");
  const sectionDetail = document.getElementById("section-detail");
  const frameTarget = document.getElementById("section-home");

  function checkVisibility() {
    const resultTop = document.getElementById("result").getBoundingClientRect().top;
    const homeTop = frameTarget.getBoundingClientRect().top;
    const viewportHeight = window.innerHeight;

    if (resultTop > 0 && resultTop < viewportHeight) {
      btnResult.classList.add("hidden");
      btnEstimate.classList.remove("hidden");
    } else if (homeTop <= viewportHeight * 0.8) {
      btnResult.classList.add("hidden");
      btnEstimate.classList.add("hidden");
    } else {
      btnResult.classList.remove("hidden");
      btnEstimate.classList.add("hidden");
    }
  }

  btnResult?.addEventListener("click", () => {
    sectionDetail?.scrollIntoView({ behavior: "smooth" });
  });

  btnEstimate?.addEventListener("click", () => {
    frameTarget?.scrollIntoView({ behavior: "smooth" });
  });

  window.addEventListener("scroll", checkVisibility);
  checkVisibility();
});


document.addEventListener("DOMContentLoaded", () => {
  let lastShown = ""; // 現在表示中のボタンを追跡

  const btnResult = document.getElementById("floatingScrollButton");
  const btnEstimate = document.getElementById("floatingEstimateButton");
  const sectionDetail = document.getElementById("section-detail");
  const frameTarget = document.getElementById("frame-target");

  function checkVisibility() {
    const resultTop = document.getElementById("result").getBoundingClientRect().top;
    const homeTop = frameTarget.getBoundingClientRect().top;
    const viewportHeight = window.innerHeight;

    if (resultTop > 0 && resultTop < viewportHeight) {
      if (lastShown !== "estimate") {
        btnResult.classList.add("hidden");
        btnEstimate.classList.remove("hidden");
        lastShown = "estimate";
      }
    } else if (homeTop <= viewportHeight * 0.8) {
      if (lastShown !== "none") {
        btnResult.classList.add("hidden");
        btnEstimate.classList.add("hidden");
        lastShown = "none";
      }
    } else {
      if (lastShown !== "result") {
        btnResult.classList.remove("hidden");
        btnEstimate.classList.add("hidden");
        lastShown = "result";
      }
    }
  }

  btnResult?.addEventListener("click", () => {
    sectionDetail?.scrollIntoView({ behavior: "smooth" });
  });

  btnEstimate?.addEventListener("click", () => {
    const rect = frameTarget.getBoundingClientRect();
    const offset = window.scrollY + rect.top - 40;
    window.scrollTo({ top: offset, behavior: "smooth" });
  });

  window.addEventListener("scroll", checkVisibility);
  checkVisibility();
});


// ==== 結果セクション表示後のボタン切替 ====
function showEstimateButtonAfterResult() {
  const scrollBtn = document.getElementById("floatingScrollButton");
  const estimateBtn = document.getElementById("floatingEstimateButton");
  if (scrollBtn) scrollBtn.classList.add("hidden");
  if (estimateBtn) estimateBtn.classList.remove("hidden");
}
// 結果が表示されたときにこの関数を呼び出してください（例：calculate後）

// ✅ 正規の送信処理（reCAPTCHA＋ハニーポット）
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("mainForm");
  const submitBtn = document.getElementById("submitBtn");

  if (!form || !submitBtn) return;

  submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const honeypot = document.getElementById("honeypot");
    if (honeypot && honeypot.value !== "") {
      alert("スパムが検出されました。");
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    grecaptcha.ready(async () => {
      try {
        const token = await grecaptcha.execute('6LcAiQgrAAAAABqJbHXcUAPtS51E4HVZjrq22Mve', { action: 'submit' });

const costInputCheckedRaw = document.getElementById("costInputCheckbox")?.checked || false;
const solarInstalledRaw = document.getElementById("solarInstalled")?.checked || false;

const costInputChecked = costInputCheckedRaw ? "True" : "False";
const solarInstalled = solarInstalledRaw ? "True" : "False";

const monthlyUsageMax = costInputChecked === "True" ? "" : document.getElementById("monthlyUsageMax")?.value || "";
const monthlyUsageMin = costInputChecked === "True" ? "" : document.getElementById("monthlyUsageMin")?.value || "";
const monthlyCostMax = costInputChecked === "False" ? "" : document.getElementById("monthlyCostMax")?.value || "";
const monthlyCostMin = costInputChecked === "False" ? "" : document.getElementById("monthlyCostMin")?.value || "";

const payload = {
  userName: document.getElementById("userName")?.value || "",
  userAddress: document.getElementById("userAddress")?.value || "",
  userPhone: document.getElementById("userPhone")?.value || "",
  userEmail: document.getElementById("userEmail")?.value || "",
  roofMaterial: document.getElementById("roofMaterial")?.value || "",
  roofSlope: document.getElementById("roofSlope")?.value || "",
  otherPanelPlace: document.getElementById("otherPanelPlace")?.value || "",
  electricCompany: document.getElementById("electricCompany")?.value || "",
  saltArea: document.querySelector('input[name="saltArea"]:checked')?.value || "",
  competitorCount: document.getElementById("competitorCount")?.value || "",
  estimateType: document.querySelector('input[name="estimateType"]:checked')?.value || "",
  installTime: document.getElementById("installTime")?.value || "",
  costInputChecked: costInputChecked,
  solarInstalled: solarInstalled,
  panelOutput: document.getElementById("panelOutput")?.value || "",
  daytimeDays: document.getElementById("daytimeDays")?.value || "",
  monthlyUsageMax: monthlyUsageMax,
  monthlyUsageMin: monthlyUsageMin,
  monthlyCostMax: monthlyCostMax,
  monthlyCostMin: monthlyCostMin,
  battery: document.getElementById("battery")?.value || "",
  batteryOtherCapacity: document.getElementById("batteryOtherCapacity")?.value || "",
  batteryOtherCost: document.getElementById("batteryOtherCost")?.value || "",
  privacyAgreed: document.getElementById("privacyAgree")?.checked ? "同意済" : "",
  timestamp: new Date().toLocaleString(),
  recaptchaToken: token
};


        const endpoint = "https://script.google.com/macros/s/AKfycbyIB3dD4YGsu9TgENKkMwG_u8m6msX0lxL61cn_z1hNziC2trOYQIUQzEiBTNAA3rzX/exec";


        // デバッグ情報
        //console.log("送信するpayloadの中身：", payload);

        await fetch(endpoint, {
          method: "POST",
          mode: "no-cors",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams(payload).toString()
        });

        alert("送信完了しました！");
      } catch (error) {
        alert("送信中にエラーが発生しました。");
        console.error("送信エラー:", error);

      }
    });
  });
});

// --- フォーム送信イベント処理 ---
const form = document.getElementById("mainForm");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const honeypot = document.getElementById("honeypot");
  if (honeypot && honeypot.value !== "") {
    alert("スパムが検出されました。");
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  submitBtn.disabled = true;
  setTimeout(() => submitBtn.disabled = false, 30000);

  grecaptcha.ready(async () => {
    try {
      const token = await grecaptcha.execute('your-site-key', { action: 'submit' });

      await fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(new FormData(form)),
      });

      alert("送信が完了しました！");
    } catch (err) {
      alert("送信に失敗しました");
      console.error(err);
    }
  });
});
}