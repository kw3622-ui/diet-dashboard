// diet-ai Edge Function deployed as version 11; source version v0.0.5
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const RECENT_TREND_DAYS = 14;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getToneContext(aiMode?: string) {
  if (aiMode === "sparta") {
    return "\n\n[페르소나: 스파르타 트레이너]\n당신은 아주 엄격하고 냉정한 헬스케어 트레이너입니다. 나태해진 사용자에게 강력하게 경고하고, 잘못된 식습관이나 운동 부족에 대해 변명할 여지 없이 팩트 폭격을 날려 정신을 번쩍 들게 하세요. 감정적 위로보다는 냉혹하고 직설적인 평가가 필요합니다.";
  } else if (aiMode === "angel") {
    return "\n\n[페르소나: 천사 멘토]\n당신은 한없이 다정하고 따뜻한 헬스케어 멘토입니다. 절대 혼내거나 강압적으로 말하지 마세요. 우선 작은 노력이라도 크게 칭찬하고 공감해 준 뒤, 개선할 점은 '건강이 걱정되는 따뜻한 마음'을 담아 아주 부드럽고 친절하게 권유하세요.";
  }
  return "\n\n[페르소나: 프로페셔널 코치]\n당신은 이성적이고 객관적인 전문가입니다. 감정적인 질책이나 과도한 칭찬을 배제하고, 왜 좋은지 혹은 왜 안 좋은지 과학적/영양학적 사실만 담백하게 설명하세요. 그리고 실현 가능한 구체적인 대안과 행동 지침을 제시하세요.";
}

// 핵심 원칙: 근거 기반 코칭 + 분량 판단 + 복합 위험요인 설명 + 반복 회피 + 자가 점검 체크리스트.
// 모든 호출에 공통으로 붙는 고정 문구라 토큰 비용은 요청당 수십 토큰 수준입니다.
const CORE_PRINCIPLES =
  `\n\n[🎯 핵심 원칙]\n` +
  `1. 당신은 임상 영양사 수준의 근거 기반 조언을 제공하는 헬스케어 코치입니다. 확실하지 않은 수치나 출처 불분명한 통계는 단정적으로 말하지 마세요.\n` +
  `2. 기록에 분량 표현(한입, 1팩, 1조각, 반 공기, 200ml 등)이 있다면 그 양이 이 끼니/시간대 기준으로 충분한지·과한지·부족한지도 판단해서 코멘트에 포함하세요.\n` +
  `3. 여러 위험 요인이 한 끼/한 기간에 동시에 겹칠 때(예: 야식+음주+고퓨린 음식)는 각각을 따로 나열하기보다 "왜 같이 있으면 더 위험한지"를 설명하세요.\n` +
  `4. 이미 했던 말을 기계적으로 반복하지 말고, 이번 기록/기간에서 실제로 관찰되는 구체적인 내용을 근거로 조언하세요.\n` +
  `[✅ 답변 전 자가 점검] 최종 답변을 작성하기 전에 스스로 확인하세요: (1) 분량을 판단했는가 (2) 기저질환은 실제로 관련 있을 때만 언급했는가 (3) 최근 흐름과 비교해 의미 있는 변화를 짚었는가 (4) 반복되는 표현을 쓰고 있지는 않은가.`;

function getCorePrinciples() {
  return CORE_PRINCIPLES;
}

// 로그 단위 분석(analyze/reanalyze)에서만 사용하는 참고 예시. 형식/깊이의 기준을 보여주기 위함이라
// "그대로 베끼지 말라"는 지시를 함께 넣어 데이터 왜곡 없이 스타일만 참고하게 합니다.
const FEW_SHOT_EXAMPLE =
  `\n\n[💬 참고 예시 (형식과 깊이만 참고하고 절대 그대로 베끼지 마세요)]\n` +
  `입력 예: "무가당 두유 1팩, 서브웨이 잠봉 샌드위치 한입" (기저질환: 통풍, 시간: 15:20)\n` +
  `좋은 analysis 예: "무가당 두유 1팩은 혈당 부담이 적은 좋은 선택이었어요. 다만 샌드위치를 한입만 드신 건 이 시간대 간식치고는 다소 부족해 보이니, 오후 활동이 남아있다면 조금 더 채우시는 게 좋아요. 잠봉(햄)에 퓨린이 있긴 하지만 한입 정도의 소량이라 통풍에 미치는 영향은 크지 않을 것으로 보여요."\n` +
  `이 예시처럼 (a) 분량에 대한 구체적 판단 (b) 기저질환과의 실제 관련성 여부(과장 없이) (c) 단정적이지 않은 어조를 참고하세요.`;

// 기저질환 가이드 사전: 흔한 질환에 대해 검증된 짧은 요약을 미리 준비해두고, disease 텍스트에 키워드가
// 매칭되면 그대로 프롬프트에 끼워 넣습니다. AI가 "기억"에 의존해 근거 불확실한 통설을 말하는 위험을 줄여줍니다.
const DISEASE_GUIDE_MAP: { keywords: string[]; guide: string }[] = [
  {
    keywords: ["통풍"],
    guide: "[통풍] 저퓨린 식단 원칙: 붉은 육류·내장류·일부 등푸른생선(고등어, 정어리 등)과 맥주를 포함한 알코올은 퓨린 함량이 높아 제한이 권장됩니다. 두부·콩류 등 식물성 단백질이 통풍에 미치는 영향은 동물성 식품보다 훨씬 작다는 것이 현재의 중론이므로 위험 식품으로 단정하지 마세요. 충분한 수분 섭취와 체중 관리가 요산 조절에 도움이 됩니다.",
  },
  {
    keywords: ["고혈압"],
    guide: "[고혈압] DASH 식단 원칙: 나트륨 섭취 제한(가공식품·국물 요리·젓갈류·라면 주의), 채소·과일·저지방 유제품·통곡물 위주 식단, 칼륨이 풍부한 식품(바나나, 시금치 등) 권장. 과도한 알코올·카페인 섭취는 혈압을 높일 수 있습니다.",
  },
  {
    keywords: ["당뇨", "혈당"],
    guide: "[혈당 관리] 정제 탄수화물·단순당(빵, 떡, 음료 등) 섭취 시 혈당이 급격히 오를 수 있습니다. 채소(식이섬유)→단백질→탄수화물 순서로 먹는 식사 순서, 규칙적인 식사 시간, 야식 자제가 인슐린 저항성 관리에 도움이 됩니다.",
  },
  {
    keywords: ["고지혈증", "이상지질혈증", "콜레스테롤"],
    guide: "[지질 관리] 포화지방·트랜스지방(튀김류, 가공육, 버터)은 제한하고, 오메가-3 및 불포화지방(생선, 견과류, 올리브유)와 식이섬유 섭취를 늘리는 것이 권장됩니다.",
  },
  {
    keywords: ["신장", "콩팥"],
    guide: "[신장 질환] 나트륨·칼륨·인 섭취는 질환 단계에 따라 담당 의료진의 개별 처방이 우선입니다. 일반적인 조언보다 신중하게, 확신 없는 수치는 단정하지 마세요.",
  },
  {
    keywords: ["지방간", "간질환"],
    guide: "[간 건강] 알코올은 간 건강에 직접적인 부담을 주며, 과도한 정제당·포화지방 섭취는 지방간을 악화시킬 수 있습니다. 체중 관리와 금주가 핵심입니다.",
  },
];

function matchDiseaseGuides(disease: string): string {
  const matched: string[] = [];
  for (const entry of DISEASE_GUIDE_MAP) {
    if (entry.keywords.some((k) => disease.includes(k))) matched.push(entry.guide);
  }
  return matched.join("\n");
}

// 기저질환 컨텍스트: 매번 기계적으로 경고를 반복하지 않고, 실제로 관련 있을 때만 언급하며
// 검증된 가이드(있다면)를 우선 근거로 사용하도록 지침을 강화했습니다.
function getDiseaseContext(disease?: string) {
  if (!disease) return "";
  const matchedGuides = matchDiseaseGuides(disease);
  const guideBlock = matchedGuides ? `\n\n[📚 관련 근거 요약 (아래 내용을 우선 근거로 사용하세요)]\n${matchedGuides}` : "";
  return `\n\n[🚨 사용자 기저질환(참고용): ${disease}]${guideBlock}\n` +
    `이 정보는 "관련이 있을 때만" 참고하세요. 아래 원칙을 반드시 지키세요.\n` +
    `1. 오늘/이 기간의 실제 기록 내용과 명확히 관련된 경우에만 이 질환을 언급하세요. 관련 없는 기록에 억지로 끌어다 붙이지 마세요.\n` +
    `2. 위에 제공된 근거 요약이 있다면 그것을 우선 사용하고, 그 외의 의학적 주장은 근거가 확실한 것만 사용하세요. 근거가 약하거나 논란이 있는 통설은 사용하지 마세요.\n` +
    `3. 매번 같은 경고 문구를 기계적으로 반복하지 말고, 이번 기록/기간에서 실제로 관찰되는 구체적인 내용을 근거로 삼아 조언하세요.\n` +
    `4. 확신이 서지 않는 의학적 주장은 단정적으로 말하지 말고, 필요하면 "정확한 진단은 담당 의료진과 상의하라"는 취지로 안내하세요.`;
}

async function callGemini(base64DataArr: string[] | null, promptText: string, callType: "log" | "report" = "log") {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
  const parts: any[] = [{ text: promptText }];
  (base64DataArr || []).forEach((b64) => {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });
  });

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: callType === "report" ? "text/plain" : "application/json" },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("AI 분석 실패: " + text);
  const result = JSON.parse(text);
  if (!result.candidates || result.candidates.length === 0) throw new Error("AI 응답이 비어있습니다.");
  const answer = result.candidates[0].content.parts[0].text;
  if (callType === "report") return answer;
  try {
    return JSON.parse(answer);
  } catch {
    const match = answer.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fallthrough */ }
    }
    throw new Error("AI 응답 포맷 에러");
  }
}

async function getTodayContextStr(supabase: any, userId: string, targetDate: string, targetTime: string, currentLogId?: string) {
  const { data, error } = await supabase
    .from("logs")
    .select("id, log_time, category, food_name, ingredients, raw_input")
    .eq("user_id", userId)
    .eq("log_date", targetDate)
    .order("log_time", { ascending: true });
  if (error || !data || data.length === 0) {
    return "\n\n[💡 오늘의 첫 기록입니다. 힘차게 하루를 시작하는 격려를 포함해주세요.]";
  }
  const targetMinute = String(targetTime || "23:59").slice(0, 5);
  const previousLogs = data
    .filter((r: any) => r.id !== currentLogId && String(r.log_time).slice(0, 5) < targetMinute)
    .slice(-8);
  if (previousLogs.length === 0) {
    return "\n\n[💡 오늘 이 기록보다 앞선 기록은 없습니다. 힘차게 하루를 시작하는 격려를 포함해주세요.]";
  }
  const lines = previousLogs.map((r: any) => {
    const raw = r.raw_input && typeof r.raw_input === "object" ? r.raw_input : {};
    const userText = [raw.naturalText, raw.memo].filter((v: any) => typeof v === "string" && v.trim()).join(" / ").slice(0, 240);
    const details = Array.isArray(r.ingredients) ? r.ingredients.join(", ") : String(r.ingredients || "");
    return `[${String(r.log_time).slice(0, 5)}] ${r.category} : ${r.food_name}${details ? ` (${details.slice(0, 180)})` : ""}${userText ? ` | 사용자 기록/메모: ${userText}` : ""}`;
  });
  return `\n\n[💡 오늘 이 기록보다 앞선 사용자 기록 요약 (시간 순서 기준)]\n${lines.join("\n")}\n* 위 사용자 기록/메모는 실제 섭취 내용과 양을 알 수 있는 1차 정보입니다. 사진에서 추정한 내용보다 우선 반영하고, 불명확한 정보는 단정하지 마세요. 현재 수정 중인 기록의 예전 내용은 포함하지 않았습니다.`;
}

function addDaysStr(dateStr: string, delta: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const BIO_METRICS = [
  { key: "bp_sys", label: "수축기 혈압", unit: "mmHg" },
  { key: "bp_dia", label: "이완기 혈압", unit: "mmHg" },
  { key: "pulse", label: "맥박", unit: "회/분" },
  { key: "sugar", label: "혈당", unit: "mg/dL" },
  { key: "weight", label: "체중", unit: "kg" },
  { key: "sleep_hours", label: "수면 시간", unit: "시간" },
] as const;

function readBioValue(rawInput: any, key: string): number | null {
  const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
  const value = raw.biometrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bioTimestampIsBefore(log: any, date: string, time: string, currentLogId?: string) {
  if (currentLogId && log.id === currentLogId) return false;
  const logDate = String(log.log_date || "");
  const logTime = String(log.log_time || "").slice(0, 5);
  const targetTime = String(time || "23:59").slice(0, 5);
  return logDate < date || (logDate === date && logTime < targetTime);
}

async function getBiometricContext(supabase: any, userId: string, targetDate: string, targetTime: string, current: any, currentLogId?: string) {
  const startDate = addDaysStr(targetDate, -28);
  const { data, error } = await supabase
    .from("logs")
    .select("id, log_date, log_time, raw_input")
    .eq("user_id", userId)
    .eq("category", "생체기록")
    .lte("log_date", targetDate)
    .order("log_date", { ascending: false })
    .order("log_time", { ascending: false })
    .limit(1000);
  if (error) throw new Error("이전 생체 수치를 불러오지 못했습니다: " + error.message);

  const prior = (data || []).filter((r: any) => bioTimestampIsBefore(r, targetDate, targetTime, currentLogId));
  const currentValues = current && typeof current === "object" ? current : {};
  const lines: string[] = [];
  for (const metric of BIO_METRICS) {
    const value = currentValues[metric.key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const history = prior
      .map((r: any) => ({ row: r, value: readBioValue(r.raw_input, metric.key) }))
      .filter((entry: any) => entry.value !== null);
    const recent = history.filter((entry: any) => entry.row.log_date >= startDate);
    const previous = history[0];
    let line = `- ${metric.label}: 이번 ${value}${metric.unit}`;
    if (previous) {
      const delta = value - previous.value;
      const deltaText = `${delta > 0 ? "+" : ""}${Number(delta.toFixed(1))}${metric.unit}`;
      line += `; 직전 기록 ${previous.row.log_date} ${String(previous.row.log_time).slice(0, 5)} ${previous.value}${metric.unit} (차이 ${deltaText})`;
    } else {
      line += "; 과거 비교 기록 없음";
    }
    if (recent.length >= 2) {
      const values = recent.map((entry: any) => entry.value);
      const avg = values.reduce((sum: number, n: number) => sum + n, 0) / values.length;
      const first = recent[recent.length - 1];
      const latest = recent[0];
      line += `; 최근 28일 ${recent.length}회, 범위 ${Math.min(...values)}–${Math.max(...values)}${metric.unit}, 평균 ${Number(avg.toFixed(1))}${metric.unit}, 기간 내 변화 ${Number((latest.value - first.value).toFixed(1))}${metric.unit}`;
    } else {
      line += `; 최근 28일 기록 ${recent.length}회 (추세 판단 자료 부족)`;
    }
    lines.push(line);
  }
  if (!lines.length) return "";
  return `\n\n[생체 수치 비교 및 최근 추이: 기준 시각 ${targetDate} ${String(targetTime || "").slice(0, 5)} 이전 기록만]\n${lines.join("\n")}\n현재 기록과 직전 기록의 차이는 산술 비교로만 설명하세요. 한 번의 변화만으로 건강 상태가 좋아지거나 나빠졌다고 단정하지 말고, 추세 자료가 부족하면 그대로 말하세요. 비교 기록이 없으면 변화 방향을 추측하지 마세요.`;
}

function getProfileContext(profile: any) {
  if (!profile || typeof profile !== "object") return "";
  const entries: string[] = [];
  const age = Number(profile.age);
  const height = Number(profile.height);
  const gender = String(profile.gender || "").trim();
  if (Number.isFinite(age) && age > 0 && age < 120) entries.push(`나이 ${age}세`);
  if (gender && gender.length <= 20) entries.push(`성별 ${gender}`);
  if (Number.isFinite(height) && height > 0 && height < 260) entries.push(`키 ${height}cm`);
  if (!entries.length) return "";
  return `\n\n[사용자 프로필 참고 정보]\n${entries.join(", ")}. 연령·성별·키는 맥락 참고값입니다. 개인의 진단이나 정상/비정상 여부를 단정하지 말고, 현재 측정값과 실제 기록을 우선하세요.`;
}

function avgTimeOfDayStr(times: string[]): string | null {
  if (times.length === 0) return null;
  const totalMinutes = times.reduce((sum, t) => {
    const [h, m] = t.split(":").map((n: string) => parseInt(n, 10) || 0);
    return sum + (h * 60 + m);
  }, 0);
  const avg = Math.round(totalMinutes / times.length);
  const h = Math.floor(avg / 60).toString().padStart(2, "0");
  const m = (avg % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// 최근 N일(기본 14일)의 음주/운동/야식 빈도, 마지막 식사 평균 시각, 일간 리포트 등급 흐름을
// 코드에서 미리 계산해서(사전 계산된 통계) 요약해줍니다. AI가 직접 원본 로그를 계산하지 않아도 되니
// 더 정확하고, "최근엔 이랬는데 오늘/이번엔 어떻다" 식의 비교형 피드백이 가능해집니다.
// 이 요약은 기존에 이미 하고 있던 단일 AI 호출의 프롬프트에 얹는 것이라, API 호출 횟수는 늘어나지 않습니다.
async function getRecentTrendSummary(supabase: any, userId: string, referenceDate: string, days: number = RECENT_TREND_DAYS) {
  const endDate = addDaysStr(referenceDate, -1); // referenceDate 당일은 별도 컨텍스트(getTodayContextStr)에서 이미 다룸
  const startDate = addDaysStr(referenceDate, -days);
  if (startDate > endDate) return "";

  const [logsRes, reportsRes] = await Promise.all([
    supabase
      .from("logs")
      .select("log_date, log_time, category, is_alcohol")
      .eq("user_id", userId)
      .gte("log_date", startDate)
      .lte("log_date", endDate),
    supabase
      .from("daily_reports")
      .select("report_date, grade")
      .eq("user_id", userId)
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true }),
  ]);

  const logs = logsRes?.data || [];
  const reports = reportsRes?.data || [];
  if (logs.length === 0 && reports.length === 0) return "";

  const spanDays = Math.round(
    (new Date(endDate + "T00:00:00Z").getTime() - new Date(startDate + "T00:00:00Z").getTime()) / 86400000,
  ) + 1;

  const mealCategories = new Set(["아침식사", "점심식사", "저녁식사", "간식", "야식"]);
  const alcoholDates = new Set<string>();
  const exerciseDates = new Set<string>();
  const nightEatingDates = new Set<string>();
  const lastMealTimeByDate = new Map<string, string>();

  logs.forEach((r: any) => {
    if (r.is_alcohol) alcoholDates.add(r.log_date);
    if (r.category === "운동") exerciseDates.add(r.log_date);
    if (r.category === "야식") nightEatingDates.add(r.log_date);
    if (mealCategories.has(r.category)) {
      const t = String(r.log_time).slice(0, 5);
      const prev = lastMealTimeByDate.get(r.log_date);
      if (!prev || t > prev) lastMealTimeByDate.set(r.log_date, t);
    }
  });

  const lines: string[] = [];
  lines.push(`음주 기록이 있었던 날: ${alcoholDates.size}일 / ${spanDays}일`);
  lines.push(`운동 기록이 있었던 날: ${exerciseDates.size}일 / ${spanDays}일`);
  const nightEatingPct = Math.round((nightEatingDates.size / spanDays) * 100);
  lines.push(`야식 기록이 있었던 날: ${nightEatingDates.size}일 / ${spanDays}일 (약 ${nightEatingPct}%)`);
  const avgLastMeal = avgTimeOfDayStr(Array.from(lastMealTimeByDate.values()));
  if (avgLastMeal) lines.push(`하루 중 마지막 식사의 평균 시각: ${avgLastMeal}`);
  if (reports.length > 0) {
    const gradeTrend = reports.map((r: any) => r.grade || "?").join("→");
    lines.push(`일간 평가 등급 흐름(오래된 순): ${gradeTrend}`);
  }

  return `\n\n[📈 참고: 최근 ${days}일(${startDate} ~ ${endDate}) 흐름 요약 (사전 계산된 통계)]\n${lines.join("\n")}\n` +
    `* 중요: 이 요약은 비교 참고용입니다. 이번 기록/기간이 이 흐름과 뚜렷하게 다른 점(개선되었거나 나빠진 부분)이 있다면 그 변화를 구체적으로 짚어서 피드백에 반영하세요. 단순히 위 요약을 그대로 나열하지 말고, 실제로 의미 있는 변화가 있을 때만 언급하세요.`;
}

function getJsonFormatReq(isBio: boolean, isExercise: boolean) {
  if (isBio) {
    return `\n\n중요: 오직 JSON 형식으로 대답하세요.\n[작성 규칙]\n1. foodName은 반드시 측정된 가장 중요한 생체 수치 요약(예: "혈압 134/90, 체중 68.5kg")으로 작성하세요. 억지로 식단을 짜지 마세요.\n2. ingredients 배열은 "입력된" 수치만 개별적으로 보기 좋게 배열에 넣으세요 (예: ["수축기: 134mmHg", "이완기: 90mmHg", "공복혈당: 102mg/dL", "체중: 68.5kg", "수면 시간: 7시간"]). "-"로 표시되어 입력되지 않은 항목은 배열에 넣지 마세요.\n3. "isAlcohol": false 고정.\n[출력 양식]\n{"foodName": "생체 수치 요약", "ingredients": ["수치1", "수치2"], "analysis": "건강 상태 분석 및 조언", "isAlcohol": false}`;
  } else if (isExercise) {
    return `\n\n중요: 오직 JSON 형식으로 대답하세요.\n[작성 규칙]\n1. ingredients 배열은 반드시 "운동종목(상세세트 및 시간)" 형태로 적으세요.\n2. 운동이므로 "isAlcohol": false 고정.\n[출력 양식]\n{"foodName": "주요 운동명", "ingredients": ["운동명(상세내용)"], "analysis": "피트니스 코멘트", "isAlcohol": false}`;
  }
  return `\n\n중요: 오직 JSON 형식으로 대답하세요.\n[작성 규칙]\n1. ingredients 배열은 반드시 "음식명(주요 식재료1, 주요 식재료2)" 형태로 상세히 적으세요.\n2. 식단에 주류가 포함되어 있다면 "isAlcohol": true 를 반드시 포함하세요.\n[출력 양식]\n{"foodName": "메인 타이틀", "ingredients": ["음식명(재료들)"], "analysis": "영양 코멘트", "isAlcohol": false}`;
}

async function uploadImages(supabase: any, userId: string, base64Arr: string[], date: string, time: string) {
  const urls: string[] = [];
  for (let i = 0; i < base64Arr.length; i++) {
    const raw = base64Arr[i];
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const path = `${userId}/${date}_${time.replace(":", "")}_${i}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("diet-images").upload(path, bytes, { contentType: "image/jpeg" });
    if (error) throw new Error("이미지 업로드 실패: " + error.message);
    const { data } = supabase.storage.from("diet-images").getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

function buildPrompt(opts: {
  type: string; isBio: boolean; isExercise: boolean; naturalText?: string; memo?: string;
  biometrics?: any; combinedContext: string; jsonFormatReq: string; mode: "new" | "edit";
}) {
  const { type, isExercise, naturalText, memo, biometrics, combinedContext, jsonFormatReq, mode } = opts;
  // 사진을 실제로 전달하는 신규 식단 분석에만 정성적 분량 코칭을 추가한다.
  const photoPortionContext = type === "image" && !isExercise && mode === "new"
    ? "\n\n[사진 속 분량과 구성 코칭]\n사진에서 보이는 전체 양과 음식 간 구성 비율을 살펴, 의미가 있을 때 기존 analysis에 자연스럽게 반영하세요. '밥과 면이 함께 있어 양이 다소 많아 보여요', '채소가 상대적으로 적어 보여요'처럼 조심스럽게 표현하세요. g·ml·칼로리 등 정량 수치를 사진만으로 만들어내지 마세요. 그릇 크기·깊이·공용 음식 여부가 불명확하면 억지로 많고 적음을 판정하지 마세요. 차려진 양이 실제 섭취량과 같다고 단정하지 말고, 사용자가 메모에 적은 섭취량을 최우선으로 반영하세요. 여러 사진이 같은 음식의 다른 각도일 수 있으므로 중복 합산하지 마세요. 분량 평가 때문에 답변을 불필요하게 늘리지 마세요."
    : "";
  if (type === "biometrics") {
    const { bp_sys, bp_dia, pulse, sugar, weight, sleep_hours } = biometrics || {};
    const verb = mode === "new" ? "입력했습니다" : "수정했습니다";
    return `사용자가 생체 수치를 ${verb}.\n혈압: ${bp_sys || "-"} / ${bp_dia || "-"}, 맥박: ${pulse || "-"}, 혈당: ${sugar || "-"}, 체중: ${weight || "-"}kg, 수면 시간: ${sleep_hours || "-"}시간${combinedContext}\n이 수치들을 분석하여 건강 상태와 조언을 작성하세요. "-"로 표시되어 입력되지 않은 항목은 언급하지 마세요.${jsonFormatReq}`;
  } else if (type === "text") {
    const label = isExercise ? "운동" : "식단";
    return mode === "new"
      ? `다음 자연어로 입력된 [${label}]을 분석해주세요: [${naturalText}].${combinedContext}${jsonFormatReq}`
      : `자연어 [${label}] 기록 재분석: [${naturalText}].${combinedContext}${jsonFormatReq}`;
  } else {
    const label = isExercise ? "운동 기록 사진들" : "음식 사진들";
    return mode === "new"
      ? `이 [${label}]을 분석해주세요. 메모: [${memo || ""}]${photoPortionContext}${combinedContext}${jsonFormatReq}`
      : `[${isExercise ? "운동 기록" : "식단 기록"}] 재분석. 추가 메모: [${memo || ""}]${combinedContext}${jsonFormatReq}`;
  }
}

async function handleAnalyze(supabase: any, userId: string, p: any) {
  const { type, base64Images, naturalText, memo, date, time, category, biometrics, disease, aiMode, profile } = p;
  const isExercise = category === "운동";
  const isBio = category === "생체기록";
  const rawInput = { type, naturalText: naturalText || "", memo: memo || "", biometrics: biometrics || null };

  const contextStr = await getTodayContextStr(supabase, userId, date, time);
  const trendStr = await getRecentTrendSummary(supabase, userId, date);
  const bioContext = isBio ? await getBiometricContext(supabase, userId, date, time, biometrics) : "";
  const profileContext = getProfileContext(profile);
  const diseaseContext = getDiseaseContext(disease);
  const timeContext = `\n\n[⏰ 현재 기록 시간: ${time}]\n'시간대(${time})'를 의학/영양학적 관점에서 분석하여 코멘트에 반영하세요.`;
  const combinedContext = diseaseContext + profileContext + timeContext + getToneContext(aiMode) + contextStr + trendStr + bioContext + getCorePrinciples() + FEW_SHOT_EXAMPLE;
  const jsonFormatReq = getJsonFormatReq(isBio, isExercise);

  let dataOnlyArr: string[] = [];
  if (type === "image" && Array.isArray(base64Images)) {
    dataOnlyArr = base64Images
      .map((img: string) => (img.startsWith("data:image") ? img.split(",")[1] : img))
      .filter(Boolean);
  }

  const prompt = buildPrompt({ type, isBio, isExercise, naturalText, memo, biometrics, combinedContext, jsonFormatReq, mode: "new" });
  const aiData = await callGemini(dataOnlyArr, prompt, "log");

  let imageUrls: string[] = [];
  if (dataOnlyArr.length > 0) imageUrls = await uploadImages(supabase, userId, dataOnlyArr, date, time);

  const safeFoodName = aiData.foodName || "이름 누락";
  const safeAnalysis = aiData.analysis || "코멘트 없음";
  const safeIngredients = Array.isArray(aiData.ingredients) ? aiData.ingredients : (aiData.ingredients ? [

async function handleReanalyze(supabase: any, userId: string, p: any) {
  const { id, type, naturalText, memo, date, time, category, biometrics, disease, aiMode, profile, existingFoodName, existingIngredients } = p;
  const isExercise = category === "운동";
  const isBio = category === "생체기록";
  const rawInput = { type, naturalText: naturalText || "", memo: memo || "", biometrics: biometrics || null };

  const contextStr = await getTodayContextStr(supabase, userId, date, time, id);
  const trendStr = await getRecentTrendSummary(supabase, userId, date);
  const bioContext = isBio ? await getBiometricContext(supabase, userId, date, time, biometrics, id) : "";
  const profileContext = getProfileContext(profile);
  const diseaseContext = getDiseaseContext(disease);
  const timeContext = `\n\n[⏰ 기록 시간: ${time}]`;
  const existingContext = existingFoodName
    ? `\n\n[💡 기존 분석 데이터 (기억 유지용)]\n- 기존 제목: ${existingFoodName}\n- 기존 상세: ${Array.isArray(existingIngredients) ? existingIngredients.join(", ") : existingIngredients}\n* 중요: 사진 없이 이 정보와 메모만으로 재분석합니다. 기존 정보를 유지하면서 변경된 시간/메모/당일맥락 만 반영하세요.`
    : "";
  const combinedContext = diseaseContext + profileContext + timeContext + getToneContext(aiMode) + contextStr + trendStr + bioContext + getCorePrinciples() + FEW_SHOT_EXAMPLE + existingContext;
  const jsonFormatReq = getJsonFormatReq(isBio, isExercise);

  const prompt = buildPrompt({ type, isBio, isExercise, naturalText, memo, biometrics, combinedContext, jsonFormatReq, mode: "edit" });
  const aiData = await callGemini([], prompt, "log");

  const safeFoodName = aiData.foodName || "이름 누락";
  const safeAnalysis = aiData.analysis || "코멘트 없음";
  const safeIngredients = Array.isArray(aiData.ingredients) ? aiData.ingredients : (aiData.ingredients ? [aiData.ingredients] : ["내용 없음"]);
  const isAlcohol = Boolean(aiData.isAlcohol);

  // ★ 기록을 수정(재분석)하면 내용/분석이 통째로 바뀌므로, 옛 분석 기준으로 답변됐던 후속 질문/답변은
  // 더 이상 맞지 않는 내용이 됩니다. 새로 물어볼 수 있도록 함께 초기화합니다.
  const { error } = await supabase
    .from("logs")
    .update({
      log_date: date, log_time: time, category, food_name: safeFoodName,
      ingredients: safeIngredients, analysis: safeAnalysis, raw_input: rawInput, is_alcohol: isAlcohol,
      followup_question: null, followup_answer: null,
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error("수정 실패: " + error.message);

  return {
    date, time, category, rawInput: JSON.stringify(rawInput), isAlcohol, foodName: safeFoodName,
    analysis: safeAnalysis, ingredients: safeIngredients, followupQuestion: null, followupAnswer: null,
  };
}

// ★ 사진/한줄기록 분석 결과에 대한 후속 질문 (기록당 1회 제한, 서버에서도 재확인해 프론트 우회를 방지)
async function handleFollowupQuestion(supabase: any, userId: string, p: any) {
  const { id, question, disease, aiMode } = p;
  if (!id) throw new Error("기록 id가 없습니다.");
  const q = (question || "").trim();
  if (!q) throw new Error("질문을 입력해주세요.");
  if (q.length > 300) throw new Error("질문은 300자 이내로 입력해주세요.");

  const { data: log, error: fetchErr } = await supabase
    .from("logs")
    .select("food_name, ingredients, analysis, followup_question")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (fetchErr || !log) throw new Error("기록을 찾을 수 없습니다.");
  if (log.followup_question) throw new Error("이미 이 기록에 대한 후속 질문을 사용하셨습니다.");

  const diseaseContext = getDiseaseContext(disease);
  const toneContext = getToneContext(aiMode);
  const prompt = `사용자가 이전에 기록한 아래 내용과 그에 대한 AI 분석에 대해 후속 질문을 했습니다.\n\n` +
    `[원본 기록]\n제목: ${log.food_name}\n상세: ${Array.isArray(log.ingredients) ? log.ingredients.join(", ") : log.ingredients}\n\n` +
    `[기존 AI 분석]\n${log.analysis}\n\n` +
    `[사용자의 후속 질문]\n${q}${diseaseContext}${toneContext}\n\n` +
    `위 원본 기록과 기존 분석 내용을 참고하여, 사용자의 후속 질문에 대해 짧고 명확하게(3~5문장 이내) 답변하세요. 새로운 분석을 다시 하지 말고, 이 질문에 대한 답만 하세요.`;

  const answer = await callGemini([], prompt, "report");

  const { error: updateErr } = await supabase
    .from("logs")
    .update({ followup_question: q, followup_answer: answer })
    .eq("id", id)
    .eq("user_id", userId);
  if (updateErr) throw new Error("후속 질문 저장 실패: " + updateErr.message);

  return { question: q, answer };
}

async function handleDailyReport(supabase: any, userId: string, p: any) {
  const { date, summaryData, disease, aiMode, profile } = p;
  const diseaseContext = getDiseaseContext(disease);
  const profileContext = getProfileContext(profile);
  const trendStr = await getRecentTrendSummary(supabase, userId, date);
  const prompt = `[오늘 하루 데이터 요약 (시간순)]\n${summaryData}${diseaseContext}${profileContext}${getToneContext(aiMode)}${trendStr}${getCorePrinciples()}\n\n위 데이터를 분석하여 오늘 하루의 성과를 평가해주세요. 활동/식사 '시간대'와 영양소 밸런스를 중요하게 고려하세요. 위에 최근 흐름 요약이 있다면, 오늘이 그 흐름과 비교해 어떤지(개선/유지/악화)도 코멘트에 자연스럽게 녹여주세요.\n반드시 아래 JSON 양식으로만 대답하세요:\n{"grade": "A", "comment": "오늘 하루를 평가하는 코멘트 (2~3줄)"}\n* grade는 A, B, C, D, F 중 하나로만 평가하세요.`;

  let aiData: any = await callGemini([], prompt, "log");
  if (typeof aiData === "string") {
    try {
      const match = aiData.match(/\{[\s\S]*\}/);
      aiData = JSON.parse(match ? match[0] : aiData);
    } catch { aiData = { grade: "?", comment: aiData }; }
  }

  const { error } = await supabase
    .from("daily_reports")
    .upsert({ user_id: userId, report_date: date, grade: aiData.grade, comment: aiData.comment }, { onConflict: "user_id,report_date" });
  if (error) throw new Error("하루 평가 저장 실패: " + error.message);

  return aiData;
}

async function handlePeriodReport(supabase: any, userId: string, p: any) {
  const { periodStart, summaryData, isMonth, disease, aiMode, profile } = p;
  const periodText = isMonth ? "월간" : "주간";
  const diseaseContext = getDiseaseContext(disease);
  const profileContext = getProfileContext(profile);
  const trendStr = await getRecentTrendSummary(supabase, userId, periodStart);
  const prompt = `다음은 사용자의 ${periodText} 식단, 운동, 생체 수치 데이터 요약입니다.${diseaseContext}${profileContext}${getToneContext(aiMode)}${trendStr}${getCorePrinciples()}\n영양소 밸런스와 시간대별 패턴(규칙성, 야식 여부 등)에 집중해서 분석하세요. 위에 이 기간 시작 직전 흐름 요약이 있다면, 이번 ${periodText}이 그 이전 흐름과 비교해 어떻게 달라졌는지도 짚어주세요.\n\n[🚨 리포트 디자인 양식 (마크다운 필수 적용)]\n1. 가독성을 위해 반드시 3~4개의 핵심 주제(예: 📊 ${periodText} 총평, 🌟 칭찬할 점, 💡 개선할 점 등)로 나누어 설명하세요.\n2. 각 주제의 제목 앞에는 반드시 '## '을 붙이세요. (예: ## 📊 주간 총평)\n3. 강조하고 싶은 핵심 단어나 긍정적인 변화는 **별표 두 개**로 감싸서 굵게 표시하세요. (예: **유산소 운동**을 잘하셨네요!)\n4. 너무 긴 문장은 피하고 리듬감 있게 짧은 문단으로 나누어 작성하세요.\n\n[데이터 요약]\n${summaryData}`;

  const reportText = await callGemini([], prompt, "report");

  const { error } = await supabase
    .from("period_reports")
    .upsert({ user_id: userId, period_start: periodStart, is_month: !!isMonth, report_text: reportText }, { onConflict: "user_id,period_start,is_month" });
  if (error) throw new Error("리포트 저장 실패: " + error.message);

  return reportText;
}

// 관리자 전용: 회원 계정을 완전히 삭제 (auth.users 삭제 시 profiles/logs/daily_reports/period_reports가 FK cascade로 함께 삭제됨)
async function handleDeleteUser(anonClient: any, adminUserId: string, p: any) {
  const targetUserId = p?.targetUserId;
  if (!targetUserId) throw new Error("삭제할 계정 id가 없습니다.");
  if (targetUserId === adminUserId) throw new Error("본인 계정은 이 기능으로 삭제할 수 없습니다.");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("서버에 서비스 롤 키가 없습니다.");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 관리자 계정은 안전상 이 경로로 삭제하지 못하게 서버에서도 한 번 더 확인
  const { data: targetProfile } = await admin.from("profiles").select("is_admin").eq("id", targetUserId).single();
  if (targetProfile?.is_admin) throw new Error("관리자 계정은 삭제할 수 없습니다.");

  // 해당 사용자가 업로드한 사진들 정리
  try {
    const { data: files } = await admin.storage.from("diet-images").list(targetUserId);
    if (files && files.length > 0) {
      const paths = files.map((f: any) => `${targetUserId}/${f.name}`);
      await admin.storage.from("diet-images").remove(paths);
    }
  } catch { /* 이미지 정리 실패는 계정 삭제 자체를 막지 않음 */ }

  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) throw new Error("회원 삭제 실패: " + error.message);

  return { success: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!GEMINI_API_KEY) return json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않습니다." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "인증이 필요합니다." }, 401);
    const userId = userData.user.id;

    // 마이 관리자가 승인한 계정만 AI를 호출할 수 있도록 서버측에서도 확인 (프론트 우회 방지)
    const { data: prof, error: profErr } = await supabase.from("profiles").select("is_approved, is_admin").eq("id", userId).single();
    if (profErr || !prof?.is_approved) {
      return json({ error: "가입 승인 대기 중입니다. 관리자의 승인 후 이용해주세요." }, 403);
    }

    const { action, payload } = await req.json();

    if (action === "deleteUser" && !prof?.is_admin) {
      return json({ error: "관리자만 사용할 수 있는 기능입니다." }, 403);
    }

    let result: unknown;
    switch (action) {
      case "analyze": result = await handleAnalyze(supabase, userId, payload); break;
      case "reanalyze": result = await handleReanalyze(supabase, userId, payload); break;
      case "followupQuestion": result = await handleFollowupQuestion(supabase, userId, payload); break;
      case "dailyReport": result = await handleDailyReport(supabase, userId, payload); break;
      case "periodReport": result = await handlePeriodReport(supabase, userId, payload); break;
      case "deleteUser": result = await handleDeleteUser(supabase, userId, payload); break;
      default: return json({ error: "알 수 없는 action: " + action }, 400);
    }
    return json(result);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
