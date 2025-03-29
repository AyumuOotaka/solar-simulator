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
function updateGraphBatteryEffect(years, batteryEffectArray, equipmentCost) {
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
    console.log("すべての評価組み合わせがルールで網羅されています。");
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
    // 新規導入の場合：施工年 = nowYear, FIT期間はパネル容量に応じて
    let fitYears = (panelOutput < 10) ? 10 : 20;
    let baseRate = getBaseRate(nowYear, panelOutput);
    for (let i = 1; i <= simulationYears; i++) {
      let sellPrice = (i <= fitYears) ? baseRate : POST_FIT_PRICE;
      totalIncome += totalSellEnergy * sellPrice;
    }
  } else {
    // 導入済みの場合：施工年はユーザー入力の solarYear を使用
    let solarYear = parseInt(document.getElementById("solarYear").value, 10) || nowYear;
    let fitYears = (panelOutput < 10) ? 10 : 20;
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
  updateGraphDetailed(simulationData, computedEquipmentCost);

  // 11) 詳細シミュレーション結果の表示（1年目の値を使用）
  let resultHTML = `<h3>詳細シミュレーション結果</h3>
    <table border="1" cellspacing="0" cellpadding="5">
      <tr>
        <th>項目</th>
        <th>金額 (円)</th>
      </tr>
      <tr>
        <td>年間電気使用量</td>
        <td>${annualUsage.toLocaleString()} kWh</td>
      </tr>
      <tr>
        <td>太陽光なしの年間電気料金</td>
        <td>${baseResult.noSolarAnnualCost.toLocaleString()} 円</td>
      </tr>
      <tr>
        <td>太陽光ありの年間電気料金</td>
        <td>${baseResult.solarAnnualCost.toLocaleString()} 円</td>
      </tr>
      <tr>
        <td>節電金額</td>
        <td>${detailedSavings.toLocaleString()} 円</td>
      </tr>
      <tr>
        <td>年間売電量</td>
        <td>${baseResult.annualSellEnergy.toLocaleString()} kWh</td>
      </tr>
      <tr>
        <td>年間売電金額</td>
        <td>${simulationData.yearlySellIncome[0].toLocaleString()} 円</td>
      </tr>
      <tr>
        <td>設備導入費用</td>
        <td>${computedEquipmentCost.toLocaleString()} 円</td>
      </tr>
    </table>
    <p>${(computedEquipmentCost > 0) ? ("設備導入費用: " + computedEquipmentCost.toLocaleString() + " 円") : ""}</p>`;

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
    const resultNoBattery = calculateSolarImpact(annualUsage, panelOutput, daytimeDays, 0);
    let batteryEffect = (baseResult.savings - resultNoBattery.savings)
                        - resultNoBattery.annualSellIncome
                        + baseResult.annualSellIncome;
    for (let y = 1; y <= 20; y++) {
      if (batteryEffect * y >= computedEquipmentCost) {
        breakEvenYear = y;
        break;
      }
    }
  }
  const breakEvenText = (breakEvenYear)
    ? `元が取れる年数: <strong>${breakEvenYear} 年</strong>`
    : `20年以内に元が取れません`;
  resultHTML += `<p>${breakEvenText}</p>`;

  document.getElementById("result").innerHTML = resultHTML;

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

  let x3 = (detailedSavings + baseResult.annualSellEnergy) / 10000;
  let rec_E3 = (x3 <= 0) ? -25 : (0.01 * Math.pow(x3, 2) - (500 / (x3 + 10)) + 25);
  rec_E3 = Math.max(-25, Math.min(25, rec_E3));

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
      <li>回収期間の評価: ${rec_E1.toFixed(1)} %</li>
      <li>初期費用の評価: ${rec_E2.toFixed(1)} %</li>
      <li>年間経済効果の評価: ${rec_E3.toFixed(1)} %</li>
      <li>電気代削減割合の評価: ${rec_E4.toFixed(1)} %</li>
    </ul>
    <p><strong>【営業部コメント】</strong></p>
    <p>${salesComment}</p>
  `;
  document.getElementById("result").innerHTML += recommendationHTML;

  console.log("Detailed Simulation Data (Year 1):", baseResult);
  console.log("breakEvenYear:", breakEvenYear);
  console.log("rec_E1:", rec_E1, " rec_E2:", rec_E2, " rec_E3:", rec_E3, " rec_E4:", rec_E4);
  console.log("recommendedDegree:", recommendedDegree);
}

