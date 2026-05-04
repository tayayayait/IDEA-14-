"""관세청_품목별 국가별 수출입실적 API 테스트 스크립트"""
import os
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("PUBLIC_DATA_API_KEY", "")
if not API_KEY:
    print("ERROR: PUBLIC_DATA_API_KEY not found in .env")
    exit(1)

print(f"API Key: {API_KEY[:15]}...{API_KEY[-5:]} (len={len(API_KEY)})")

# 테스트 케이스: 반도체(HS 8541) 미국 수출 실적 (2025년)
BASE_URL = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

# 테스트 1: 반도체 → 미국
test_cases = [
    {"label": "반도체(8541) → 미국(US)", "hsSgn": "8541", "cntyCd": "US", "strtYymm": "202501", "endYymm": "202506"},
    {"label": "반도체(8541) → 중국(CN)", "hsSgn": "8541", "cntyCd": "CN", "strtYymm": "202501", "endYymm": "202506"},
    {"label": "자동차부품(8708) → 일본(JP)", "hsSgn": "8708", "cntyCd": "JP", "strtYymm": "202501", "endYymm": "202506"},
    {"label": "HS코드 없이 → 미국(US) 전체", "hsSgn": "", "cntyCd": "US", "strtYymm": "202501", "endYymm": "202503"},
]

for tc in test_cases:
    print(f"\n{'='*60}")
    print(f"테스트: {tc['label']}")
    print(f"{'='*60}")
    
    params = {
        "serviceKey": API_KEY,
        "strtYymm": tc["strtYymm"],
        "endYymm": tc["endYymm"],
        "cntyCd": tc["cntyCd"],
    }
    if tc["hsSgn"]:
        params["hsSgn"] = tc["hsSgn"]
    
    url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"
    print(f"URL: {url[:120]}...")
    
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            
        # Parse XML
        root = ET.fromstring(body)
        
        # Check for error
        result_code = root.findtext(".//resultCode") or root.findtext(".//returnReasonCode")
        result_msg = root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg")
        
        if result_code and result_code != "00":
            print(f"  ERROR: code={result_code}, msg={result_msg}")
            continue
        
        print(f"  resultCode={result_code}, resultMsg={result_msg}")
        
        items = root.findall(".//item")
        print(f"  결과 건수: {len(items)}")
        
        for i, item in enumerate(items[:5]):  # 상위 5개만
            year = item.findtext("year", "-")
            country = item.findtext("statCdCntnKor1", "-")
            country_cd = item.findtext("statCd", "-")
            product = item.findtext("statKor", "-")
            hs_cd = item.findtext("hsCd", "-")
            exp_dlr = item.findtext("expDlr", "0")
            imp_dlr = item.findtext("impDlr", "0")
            exp_wgt = item.findtext("expWgt", "0")
            bal = item.findtext("balPayments", "0")
            
            exp_formatted = f"${int(exp_dlr):,}" if exp_dlr.lstrip('-').isdigit() else exp_dlr
            imp_formatted = f"${int(imp_dlr):,}" if imp_dlr.lstrip('-').isdigit() else imp_dlr
            
            print(f"  [{i+1}] {year} | {country}({country_cd}) | HS:{hs_cd}")
            print(f"      품목: {product}")
            print(f"      수출: {exp_formatted} | 수입: {imp_formatted}")
            
        if len(items) > 5:
            print(f"  ... 외 {len(items)-5}건 더")
            
    except Exception as e:
        print(f"  EXCEPTION: {e}")
        # Print raw response if available
        try:
            print(f"  Raw (first 500): {body[:500]}")
        except:
            pass
