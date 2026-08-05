/** Schedule 작성 양식 설정. 관리자 "양식 만들기"에서 수정하고, 작성 화면(ReportWriter)에 반영된다. */

export type FormConfig = {
  travel: {
    title: string;
    subtitle: string;
    destinationPlaceholder: string;
    purposePlaceholder: string;
  };
  events: {
    title: string;
    subtitle: string;
    typeOptions: string[];
    directInputPlaceholder: string;
    descriptionPlaceholder: string;
  };
  issues: {
    title: string;
    subtitle: string;
    categoryOptions: string[];
    detailsPlaceholder: string;
    deadlinePlaceholder: string;
  };
  ceo: {
    title: string;
    subtitle: string;
    placeholder: string;
  };
  keyQuestion: {
    title: string;
    subtitle: string;
    placeholder: string;
  };
};

export const DEFAULT_FORM_CONFIG: FormConfig = {
  travel: {
    title: "출장 및 휴가",
    subtitle: "Travel & Time Off",
    destinationPlaceholder: "도시/장소",
    purposePlaceholder: "출장 목적",
  },
  events: {
    title: "부서의 주요 일정",
    subtitle: "Key Dates & Events",
    typeOptions: ["대표님 회의", "부서 회의", "워크샵", "행사", "Store Open", "촬영", "계약", "제품 출시", "공사"],
    directInputPlaceholder: "유형을 입력하세요",
    descriptionPlaceholder: "핵심 일정",
  },
  issues: {
    title: "부서의 핵심 이슈",
    subtitle: "Key Issues & Asks",
    categoryOptions: ["핵심이슈", "과제", "의사결정", "리스크"],
    detailsPlaceholder: "배경과 필요한 액션을 명확히 작성",
    deadlinePlaceholder: "예: 8월 말",
  },
  ceo: {
    title: "CEO 요청사항",
    subtitle: "결정·협조 요청",
    placeholder: "대표님의 확인, 결정, 지원이 필요한 사항",
  },
  keyQuestion: {
    title: "Key Question",
    subtitle: "핵심 질문",
    placeholder: "부서장이 하고있는 가장 중요한 질문 (한 주에만 해당되는 것은 아님)",
  },
};

function cleanText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function cleanOptions(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return [...fallback];
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(cleaned));
  return unique.length ? unique : [...fallback];
}

/** 저장된 설정(부분/손상 가능)을 기본값과 병합해 항상 완전한 설정을 돌려준다. */
export function mergeFormConfig(saved: unknown): FormConfig {
  const raw = (saved && typeof saved === "object" ? saved : {}) as Partial<Record<keyof FormConfig, Record<string, unknown>>>;
  const d = DEFAULT_FORM_CONFIG;
  return {
    travel: {
      title: cleanText(raw.travel?.title, d.travel.title),
      subtitle: cleanText(raw.travel?.subtitle, d.travel.subtitle),
      destinationPlaceholder: cleanText(raw.travel?.destinationPlaceholder, d.travel.destinationPlaceholder),
      purposePlaceholder: cleanText(raw.travel?.purposePlaceholder, d.travel.purposePlaceholder),
    },
    events: {
      title: cleanText(raw.events?.title, d.events.title),
      subtitle: cleanText(raw.events?.subtitle, d.events.subtitle),
      typeOptions: cleanOptions(raw.events?.typeOptions, d.events.typeOptions),
      directInputPlaceholder: cleanText(raw.events?.directInputPlaceholder, d.events.directInputPlaceholder),
      descriptionPlaceholder: cleanText(raw.events?.descriptionPlaceholder, d.events.descriptionPlaceholder),
    },
    issues: {
      title: cleanText(raw.issues?.title, d.issues.title),
      subtitle: cleanText(raw.issues?.subtitle, d.issues.subtitle),
      categoryOptions: cleanOptions(raw.issues?.categoryOptions, d.issues.categoryOptions),
      detailsPlaceholder: cleanText(raw.issues?.detailsPlaceholder, d.issues.detailsPlaceholder),
      deadlinePlaceholder: cleanText(raw.issues?.deadlinePlaceholder, d.issues.deadlinePlaceholder),
    },
    ceo: {
      title: cleanText(raw.ceo?.title, d.ceo.title),
      subtitle: cleanText(raw.ceo?.subtitle, d.ceo.subtitle),
      placeholder: cleanText(raw.ceo?.placeholder, d.ceo.placeholder),
    },
    keyQuestion: {
      title: cleanText(raw.keyQuestion?.title, d.keyQuestion.title),
      subtitle: cleanText(raw.keyQuestion?.subtitle, d.keyQuestion.subtitle),
      placeholder: cleanText(raw.keyQuestion?.placeholder, d.keyQuestion.placeholder),
    },
  };
}
