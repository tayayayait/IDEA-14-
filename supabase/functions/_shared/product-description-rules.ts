export const UNKNOWN_TEXT = "\uD655\uC2E4\uD55C \uC815\uBCF4 \uC5C6\uC74C";

export type ProductDescriptionInput = {
  companyName: string;
  industrialComplex: string;
  industryCode: string;
  region: string;
  mainProduct: string;
  productKeyword: string;
  components: string;
};

const PASSENGER_VEHICLE_SEAT = "\uC2B9\uC6A9 \uC790\uB3D9\uCC28 \uC2DC\uD2B8";
const ELECTRONIC_MATERIAL = "\uC804\uC790\uC7AC\uB8CC";
const ELECTRONIC_COMPONENT = "\uC804\uC790\uBD80\uD488";
const VEHICLE_SEAT_PATTERN =
  /(?:(?:\uC2B9\uC6A9\s*\uC790\uB3D9\uCC28|\uC2B9\uC6A9\uCC28|\uC790\uB3D9\uCC28|\uCC28\uB7C9|vehicle|automotive|car).*(?:\uC2DC\uD2B8|\uC758\uC790|seat)|(?:\uC2DC\uD2B8|\uC758\uC790|seat).*(?:\uC2B9\uC6A9\s*\uC790\uB3D9\uCC28|\uC2B9\uC6A9\uCC28|\uC790\uB3D9\uCC28|\uCC28\uB7C9|vehicle|automotive|car))/i;
const ELECTRONIC_MATERIAL_PATTERN =
  /(?:\uC804\uC790\s*(?:\uC7AC\uB8CC|\uC790\uB8CC|\uC18C\uC7AC)|electronic\s*materials?)/i;
const ELECTRONIC_COMPONENT_PATTERN =
  /(?:\uC804\uC790\s*\uBD80\uD488|electronic\s*components?|26299)/i;

export function deriveProductSubject(name: string): string {
  const normalized = normalizeText(name);
  const subject = normalized
    .replace(/\s*(?:\uC81C\uC870|\uC0DD\uC0B0|\uAC00\uACF5)\s*$/g, "")
    .replace(/\s*(?:\uC81C\uD488|\uD488\uBAA9)\s*$/g, "")
    .trim();

  if (isPassengerVehicleSeat(subject)) return PASSENGER_VEHICLE_SEAT;
  if (isElectronicMaterial(subject)) return ELECTRONIC_MATERIAL;
  if (isElectronicComponent(subject)) return ELECTRONIC_COMPONENT;

  return (subject || normalized)
    .replace(/\uC2B9\uC6A9\uC790\uB3D9\uCC28/g, "\uC2B9\uC6A9 \uC790\uB3D9\uCC28")
    .trim();
}

export function buildProductInterpretationHint(name: string, input: ProductDescriptionInput): string {
  const source = buildSource(deriveProductSubject(name), input);
  if (isPassengerVehicleSeat(source)) {
    return "\uC2B9\uC6A9\uC790\uB3D9\uCC28 \uC2DC\uD2B8\uB294 \uC2B9\uC6A9 \uC790\uB3D9\uCC28 \uB0B4\uBD80 \uC88C\uC11D \uBD80\uD488\uC73C\uB85C \uD574\uC11D\uD569\uB2C8\uB2E4. \uC81C\uD488\uBA85\uB9CC\uC73C\uB85C \uD655\uC778\uB418\uC9C0 \uC54A\uB294 \uC138\uBD80 \uC0AC\uC591\uC740 \uB2E8\uC815\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.";
  }
  if (isElectronicMaterial(source) || isElectronicComponent(source)) {
    return "\uC785\uB825\uAC12\uC758 \uC804\uC790\uC790\uB8CC\uB294 \uC804\uC790\uC7AC\uB8CC \uB610\uB294 \uC804\uC790\uBD80\uD488 \uACC4\uC5F4\uB85C \uD574\uC11D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC138\uBD80 \uC18C\uC7AC\u00B7\uD615\uC0C1\u00B7\uACF5\uC815 \uC815\uBCF4\uB294 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
  }
  return "제품명(일반 명사)을 기준으로 해당 제품의 보편적인 용도, 특성, 성질을 설명하세요. 특수 규격이 없다면 일반적인 수준의 상식을 바탕으로 자연스럽게 설명합니다.";
}

export function buildProductOverview(productSubject: string): string {
  const subjectWithParticle = `${productSubject}${topicParticle(productSubject)}`;
  if (isPassengerVehicleSeat(productSubject)) {
    return "\uC2B9\uC6A9 \uC790\uB3D9\uCC28 \uC2DC\uD2B8\uB294 \uC2B9\uC6A9 \uC790\uB3D9\uCC28 \uC2E4\uB0B4\uC5D0 \uC7A5\uCC29\uB418\uC5B4 \uC6B4\uC804\uC790\uC640 \uD0D1\uC2B9\uC790\uC758 \uCC29\uC88C \uC790\uC138\uB97C \uC9C0\uC9C0\uD558\uB294 \uC88C\uC11D \uBD80\uD488\uC785\uB2C8\uB2E4.";
  }
  if (isElectronicMaterial(productSubject)) {
    return "\uC804\uC790\uC7AC\uB8CC\uB294 \uBC18\uB3C4\uCCB4, \uB514\uC2A4\uD50C\uB808\uC774, \uC13C\uC11C, \uD68C\uB85C\uAE30\uD310 \uB4F1 \uC804\uC790\uBD80\uD488 \uC81C\uC870\uC5D0 \uD22C\uC785\uB418\uB294 \uAE30\uB2A5\uC131 \uC18C\uC7AC \uB610\uB294 \uBD80\uC790\uC7AC\uC785\uB2C8\uB2E4.";
  }
  if (isElectronicComponent(productSubject)) {
    return "\uC804\uC790\uBD80\uD488\uC740 \uC804\uC790\uAE30\uAE30\uC758 \uD68C\uB85C \uAD6C\uC131, \uC2E0\uD638 \uCC98\uB9AC, \uC804\uC6D0 \uC81C\uC5B4, \uAC10\uC9C0 \uAE30\uB2A5 \uB4F1\uC5D0 \uC0AC\uC6A9\uB418\uB294 \uBD80\uD488\uAD70\uC785\uB2C8\uB2E4.";
  }
  if (/(?:DRAM|\uB514\uB7A8|\uBA54\uBAA8\uB9AC)/i.test(productSubject)) {
    return `${subjectWithParticle} \uB370\uC774\uD130\uB97C \uC77C\uC2DC\uC801\uC73C\uB85C \uC800\uC7A5\uD558\uACE0 \uBE60\uB974\uAC8C \uC77D\uACE0 \uC4F0\uAE30 \uC704\uD574 \uC0AC\uC6A9\uD558\uB294 \uBA54\uBAA8\uB9AC \uBC18\uB3C4\uCCB4\uC785\uB2C8\uB2E4.`;
  }
  if (/(?:\uBC18\uB3C4\uCCB4)/.test(productSubject)) {
    return `${subjectWithParticle} \uD2B9\uC815 \uC870\uAC74\uC5D0 \uB530\uB77C \uC804\uAE30\uB97C \uD1B5\uD558\uAC8C \uD558\uAC70\uB098 \uD1B5\uD558\uC9C0 \uC54A\uAC8C \uD574 \uC804\uAE30 \uC2E0\uD638\uB97C \uC81C\uC5B4\uD558\uB294 \uC804\uC790 \uBD80\uD488 \uB610\uB294 \uC18C\uC7AC\uC785\uB2C8\uB2E4.`;
  }
  if (/(?:\uCD95\uC804\uC9C0|\uCDA9\uC804\uC9C0|\uBC30\uD130\uB9AC|\uC804\uC9C0)/.test(productSubject)) {
    return `${subjectWithParticle} \uC804\uAE30 \uC5D0\uB108\uC9C0\uB97C \uD654\uD559 \uC5D0\uB108\uC9C0 \uD615\uD0DC\uB85C \uC800\uC7A5\uD588\uB2E4\uAC00 \uD544\uC694\uD560 \uB54C \uC804\uC6D0\uC73C\uB85C \uACF5\uAE09\uD558\uB294 \uC7A5\uCE58\uC785\uB2C8\uB2E4.`;
  }
  if (/(?:\uC804\uB3D9\uAE30|\uBAA8\uD130)/.test(productSubject)) {
    return `${subjectWithParticle} \uC804\uAE30 \uC5D0\uB108\uC9C0\uB97C \uD68C\uC804 \uC6B4\uB3D9\uC73C\uB85C \uBCC0\uD658\uD574 \uAE30\uACC4\uB97C \uAD6C\uB3D9\uD558\uB294 \uC7A5\uCE58\uC785\uB2C8\uB2E4.`;
  }
  return `${subjectWithParticle} 일상이나 산업 현장에서 널리 사용되는 일반적인 특징과 용도를 가진 제품입니다.`;
}

export function buildProductFeatures(productSubject: string, input: ProductDescriptionInput): string {
  const source = buildSource(productSubject, input);
  if (isPassengerVehicleSeat(source)) {
    return "\uD504\uB808\uC784, \uCFE0\uC158 \uD328\uB4DC, \uCEE4\uBC84, \uD5E4\uB4DC\uB808\uC2A4\uD2B8, \uB808\uC77C\u00B7\uB9AC\uD074\uB77C\uC774\uB108 \uB4F1\uC73C\uB85C \uAD6C\uC131\uB420 \uC218 \uC788\uC73C\uBA70 \uCDA9\uACA9 \uD761\uC218, \uCC29\uC88C \uC548\uC815\uC131, \uC2B9\uD558\uCC28 \uD3B8\uC758, \uC5F4\uC120\u00B7\uD1B5\uD48D\u00B7\uC804\uB3D9 \uC870\uC808 \uAC19\uC740 \uD3B8\uC758 \uAE30\uB2A5\uC774 \uC8FC\uC694 \uAC80\uD1A0 \uC694\uC18C\uC785\uB2C8\uB2E4.";
  }
  if (isElectronicMaterial(source)) {
    return "\uC804\uAE30\uC801 \uD2B9\uC131, \uC808\uC5F0\u00B7\uB3C4\uC804\uC131, \uB0B4\uC5F4\uC131, \uC21C\uB3C4, \uC785\uB3C4, \uD615\uD0DC, \uC801\uC6A9 \uACF5\uC815\uC5D0 \uB530\uB77C \uC138\uBD80 \uBD84\uB958\uAC00 \uB2EC\uB77C\uC9C0\uBA70, \uC2E4\uC81C HS\u00B7HSK \uBD84\uB958\uC5D0\uB294 \uAD6C\uC131 \uC131\uBD84\uACFC \uC0AC\uC6A9 \uACF5\uC815 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
  }
  if (isElectronicComponent(source)) {
    return "\uAE30\uB2A5\uC5D0 \uB530\uB77C \uBC18\uB3C4\uCCB4, \uC13C\uC11C, \uCEE4\uB125\uD130, \uD68C\uB85C \uBCF4\uD638 \uBD80\uD488, \uC218\uB3D9\uC18C\uC790 \uB4F1\uC73C\uB85C \uAD6C\uBD84\uB420 \uC218 \uC788\uC73C\uBA70, \uC2E4\uC81C \uBD84\uB958\uC5D0\uB294 \uAD6C\uCCB4\uC801 \uAE30\uB2A5\uACFC \uC7AC\uC9C8 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
  }
  if (/(?:DRAM|\uB514\uB7A8|\uBA54\uBAA8\uB9AC)/i.test(source)) {
    return "\uC804\uAE30 \uC2E0\uD638\uC758 \uC800\uC7A5 \uC0C1\uD0DC\uB97C \uC774\uC6A9\uD574 \uB370\uC774\uD130 \uBE44\uD2B8\uB97C \uD45C\uD604\uD558\uBA70, \uBC18\uBCF5\uC801\uC778 \uC77D\uAE30\u00B7\uC4F0\uAE30 \uC791\uC5C5\uACFC \uC804\uC790\uAE30\uAE30\uC758 \uBA54\uBAA8\uB9AC \uAE30\uB2A5\uC774 \uD575\uC2EC\uC785\uB2C8\uB2E4.";
  }
  if (/(?:\uBC18\uB3C4\uCCB4)/.test(source)) {
    return "\uC804\uAE30\uAC00 \uD1B5\uD558\uB294 \uB3C4\uCCB4\uC640 \uC804\uAE30\uAC00 \uD1B5\uD558\uC9C0 \uC54A\uB294 \uBD80\uB3C4\uCCB4\uC758 \uC911\uAC04 \uD2B9\uC131\uC744 \uC774\uC6A9\uD574 \uC804\uB958\uC640 \uC2E0\uD638\uB97C \uC81C\uC5B4\uD558\uB294 \uBB3C\uC9C8\uC785\uB2C8\uB2E4.";
  }
  if (/(?:\uCD95\uC804\uC9C0|\uCDA9\uC804\uC9C0|\uBC30\uD130\uB9AC|\uC804\uC9C0)/.test(source)) {
    return "\uC804\uAE30 \uC5D0\uB108\uC9C0\uB97C \uC800\uC7A5\uD558\uACE0 \uD544\uC694 \uC2DC \uC804\uC6D0\uC73C\uB85C \uACF5\uAE09\uD558\uBA70, \uBC18\uBCF5 \uCDA9\uC804\u00B7\uBC29\uC804 \uD2B9\uC131\uC774 \uD575\uC2EC\uC785\uB2C8\uB2E4.";
  }
  if (/(?:\uC804\uB3D9\uAE30|\uBAA8\uD130)/.test(source)) {
    return "\uC804\uAE30 \uC5D0\uB108\uC9C0\uB97C \uD68C\uC804 \uC6B4\uB3D9\uC73C\uB85C \uBCC0\uD658\uD558\uB294 \uAD6C\uB3D9 \uC7A5\uCE58\uB85C, \uCD9C\uB825\u00B7\uC18D\uB3C4\u00B7\uC6A9\uB3C4\uC5D0 \uB530\uB77C \uC138\uBD80 \uAD6C\uBD84\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
  }
  if (/(?:\uC13C\uC11C|\uAC10\uC9C0\uAE30)/.test(source)) {
    return "\uBB3C\uB9AC\u00B7\uD658\uACBD \uC2E0\uD638\uB97C \uAC10\uC9C0\uD574 \uC804\uAE30 \uC2E0\uD638\uB098 \uB370\uC774\uD130\uB85C \uBCC0\uD658\uD558\uB294 \uBC29\uC2DD\uC758 \uC81C\uD488\uAD70\uC785\uB2C8\uB2E4.";
  }
  if (/(?:\uCF00\uC774\uBE14|\uC804\uC120)/.test(source)) {
    return "\uC804\uB958\uB098 \uC2E0\uD638\uB97C \uC804\uB2EC\uD558\uB294 \uB3C4\uCCB4\uC640 \uC808\uC5F0 \uAD6C\uC870\uAC00 \uD575\uC2EC\uC774\uBA70, \uC6A9\uB3C4\uC5D0 \uB530\uB77C \uADDC\uACA9 \uD655\uC778\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.";
  }
  if (/(?:\uD38C\uD504)/.test(source)) {
    return "\uC720\uCCB4\uB97C \uC774\uC1A1\uD558\uAC70\uB098 \uC555\uB825\uC744 \uD615\uC131\uD558\uB294 \uC7A5\uCE58\uB85C, \uC774\uC1A1 \uB300\uC0C1\uACFC \uC791\uB3D9 \uBC29\uC2DD\uC5D0 \uB530\uB77C \uD2B9\uC131\uC774 \uB2EC\uB77C\uC9D1\uB2C8\uB2E4.";
  }
  return `${productSubject}의 일반적인 물리·화학적 특성이나 범용적인 용도를 기준으로 설명할 수 있으며, 구체적인 규격은 모델에 따라 다를 수 있습니다.`;
}

function buildSource(productSubject: string, input: ProductDescriptionInput): string {
  return normalizeText(
    [productSubject, input.mainProduct, input.productKeyword, input.components]
      .filter(Boolean)
      .join(" "),
  );
}

function isPassengerVehicleSeat(value: string): boolean {
  return VEHICLE_SEAT_PATTERN.test(normalizeText(value));
}

function isElectronicMaterial(value: string): boolean {
  return ELECTRONIC_MATERIAL_PATTERN.test(normalizeText(value));
}

function isElectronicComponent(value: string): boolean {
  return ELECTRONIC_COMPONENT_PATTERN.test(normalizeText(value));
}

function topicParticle(value: string): string {
  const lastHangul = [...value].reverse().find((char) => /[\uAC00-\uD7A3]/.test(char));
  if (!lastHangul) return "\uB294";
  const code = lastHangul.charCodeAt(0) - 0xac00;
  return code % 28 === 0 ? "\uB294" : "\uC740";
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
