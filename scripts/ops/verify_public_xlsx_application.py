#!/usr/bin/env python3
from __future__ import annotations
import argparse, http.cookiejar, io, json, re, time, urllib.error, urllib.parse, urllib.request, uuid, zipfile

class Client:
    def __init__(self, base):
        self.base=base; self.jar=http.cookiejar.CookieJar(); self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def request(self, method, path, payload=None, headers=None, raw=None):
        data=raw; hdr={"Accept":"application/json",**(headers or {})}
        if payload is not None: data=json.dumps(payload).encode();hdr["Content-Type"]="application/json"
        req=urllib.request.Request(urllib.parse.urljoin(self.base,path),data=data,method=method,headers=hdr)
        try:
            with self.opener.open(req) as res:
                body=res.read();return res.status, json.loads(body) if body and "json" in res.headers.get("Content-Type","") else body
        except urllib.error.HTTPError as err:
            body=err.read()
            try:return err.code,json.loads(body)
            except:return err.code,{"message":body.decode(errors="replace")}
    def login(self,user,password="Test1234!"):
        status,payload=self.request("POST","/api/auth/login",{"username":user,"password":password})
        if status==200 and isinstance(payload,dict) and payload.get("requiresGateSelection"):
            gates=payload.get("gates") or []
            if not gates: raise RuntimeError(f"login {user}: gate selection without gates")
            status,payload=self.request("POST","/api/auth/login",{"username":user,"password":password,"gateId":gates[0]["id"]})
        if status!=200: raise RuntimeError(f"login {user}: {status} {payload}")

def xlsx_bytes():
    headers=["Wache [notwendig]","Vorname","Nachname","Firma / Organisation","Nationalität","Geburtsdatum","Telefon","E-Mail","Kennzeichen","Ansprechpartner","Ansprechpartner Telefon","Ansprechpartner E-Mail","Abteilung / Bereich","Besuchszweck","Gültig von [notwendig]","Gültig bis [notwendig]","Bemerkung"]
    rows=[headers,["Hauptwache","E2E","Genehmigt","Test GmbH","Deutschland","","+49 (30) 123-45","","E2E-A 1","Kontakt","","","IT","E2E Antrag","14.08.2026","14.08.2026","isolierter Test"],["Hauptwache","E2E","Abgelehnt","Test GmbH","DE","","","","","Kontakt","","","IT","E2E Antrag","14.08.2026","14.08.2026",""]]
    def cell(col,row,value):
        letters="";n=col
        while n: n,rem=divmod(n-1,26);letters=chr(65+rem)+letters
        escaped=str(value).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;")
        return f'<c r="{letters}{row}" t="inlineStr"><is><t>{escaped}</t></is></c>'
    sheet='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(f'<row r="{ri}">'+''.join(cell(ci,ri,v) for ci,v in enumerate(row,1))+'</row>' for ri,row in enumerate(rows,1))+'</sheetData></worksheet>'
    files={"[Content_Types].xml":'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',"_rels/.rels":'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',"xl/workbook.xml":'<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Antrag" sheetId="1" r:id="rId1"/></sheets></workbook>',"xl/_rels/workbook.xml.rels":'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',"xl/worksheets/sheet1.xml":sheet}
    out=io.BytesIO()
    with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as archive:
        for name,value in files.items():archive.writestr(name,value)
    return out.getvalue()

def multipart(fields,file):
    boundary="----BesucherE2E"+uuid.uuid4().hex;chunks=[]
    for key,value in fields.items():chunks += [f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()]
    chunks += [f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"antrag.xlsx\"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n".encode(),file,b"\r\n",f"--{boundary}--\r\n".encode()]
    return b"".join(chunks),f"multipart/form-data; boundary={boundary}"

def expect(actual,expected,label):
    if actual!=expected:raise RuntimeError(f"{label}: expected {expected}, got {actual}")

def verification_token(mailpit_url):
    for _ in range(30):
        with urllib.request.urlopen(f"{mailpit_url}/api/v1/messages") as response:
            messages=json.load(response).get("messages",[])
        for message in messages:
            with urllib.request.urlopen(f"{mailpit_url}/api/v1/message/{message['ID']}") as response:
                detail=json.load(response)
            match=re.search(r"visit/simplified/verify#([A-Za-z0-9_-]{43})",f"{detail.get('Text','')} {detail.get('HTML','')}")
            if match:return match.group(1)
        time.sleep(.2)
    raise RuntimeError("verification mail missing in isolated Mailpit")

def mail_count(mailpit_url):
    with urllib.request.urlopen(f"{mailpit_url}/api/v1/messages") as response:
        return len(json.load(response).get("messages",[]))

def main():
    parser=argparse.ArgumentParser();parser.add_argument("--base-url",required=True);parser.add_argument("--mailpit-url",required=True);args=parser.parse_args();public=Client(args.base_url);sibe=Client(args.base_url);kskdt=Client(args.base_url);guard=Client(args.base_url)
    expect(public.request("GET","/api/public/simplified-applications/template.xlsx")[0],200,"template")
    status,boot=public.request("GET","/api/public/simplified-applications/bootstrap");expect(status,200,"bootstrap");csrf=boot["csrfToken"];file=xlsx_bytes();body,ctype=multipart({},file)
    status,preview=public.request("POST","/api/public/simplified-applications/preview",raw=body,headers={"Content-Type":ctype,"X-CSRF-Token":csrf});expect(status,200,"preview")
    if not preview["valid"] or len(preview["rows"])!=2:raise RuntimeError(f"preview invalid: {preview}")
    expect(public.request("GET","/api/sibe/settings/public-xlsx-applications")[0],401,"unauth setting")
    guard.login("guard.demo");expect(guard.request("GET","/api/sibe/settings/public-xlsx-applications")[0],403,"guard setting")
    sibe.login("sibe.demo");kskdt.login("kaskdt.demo")
    expect(sibe.request("PATCH","/api/sibe/settings/public-xlsx-applications",{"requireEmailVerification":True})[0],200,"enable verification")
    request_id=str(uuid.uuid4());fields={"applicantEmail":"xlsx-verify-e2e@example.test","applicantName":"XLSX Verify E2E","applicantOrganization":"Isolierter Test","clientRequestId":request_id}
    mail_count_before_submit=mail_count(args.mailpit_url)
    body,ctype=multipart(fields,file)
    status,pending=public.request("POST","/api/public/simplified-applications",raw=body,headers={"Content-Type":ctype,"X-CSRF-Token":csrf});expect(status,201,"verified-mode submit");expect(pending["status"],"pending_email_verification","pending verification state")
    first_mail_count=mail_count(args.mailpit_url);expect(first_mail_count,mail_count_before_submit+1,"single verification mail")
    retry_body,retry_ctype=multipart(fields,file)
    status,retry=public.request("POST","/api/public/simplified-applications",raw=retry_body,headers={"Content-Type":retry_ctype,"X-CSRF-Token":csrf});expect(status,201,"idempotent submit retry");expect(retry["reference"],pending["reference"],"idempotent reference")
    expect(mail_count(args.mailpit_url),first_mail_count,"retry mail count")
    token=verification_token(args.mailpit_url)
    status,verified=public.request("POST","/api/public/simplified-applications/verify",headers={"X-Application-Verification-Token":token});expect(status,200,"verification");expect(verified["status"],"submitted","verified state")
    status,listed=kskdt.request("GET","/api/kaskdt/applications?status=open");expect(status,200,"verified application list")
    if len([x for x in listed["applications"] if x["reference"]==pending["reference"]])!=1:raise RuntimeError("verified application missing from KSKdt list")

    expect(sibe.request("PATCH","/api/sibe/settings/public-xlsx-applications",{"requireEmailVerification":False})[0],200,"disable verification")
    body,ctype=multipart({"applicantEmail":"xlsx-e2e@example.test","applicantName":"XLSX E2E","applicantOrganization":"Isolierter Test","clientRequestId":str(uuid.uuid4())},file)
    status,created=public.request("POST","/api/public/simplified-applications",raw=body,headers={"Content-Type":ctype,"X-CSRF-Token":csrf});expect(status,201,"submit");expect(created["status"],"submitted","submitted state")
    status,listed=kskdt.request("GET","/api/kaskdt/applications?status=open");expect(status,200,"list");matches=[x for x in listed["applications"] if x["reference"]==created["reference"]]
    if len(matches)!=1:raise RuntimeError("application missing from KSKdt list")
    app_id=matches[0]["id"];status,detail=kskdt.request("GET",f"/api/kaskdt/applications/{app_id}");expect(status,200,"detail")
    status,decision_payload=kskdt.request("POST",f"/api/kaskdt/applications/{app_id}/decisions",{"decision":"approved","applicationVersion":detail["version"],"entryIds":[detail["entries"][0]["id"]]})
    if status!=200: raise RuntimeError(f"approve version={detail.get('version')!r}: {status} {decision_payload}")
    detail=decision_payload
    pending=[x for x in detail["entries"] if x["status"]=="pending"]
    status,decision_payload=kskdt.request("POST",f"/api/kaskdt/applications/{app_id}/decisions",{"decision":"rejected","rejectionReason":"E2E-Ablehnung","applicationVersion":detail["version"],"entryIds":[pending[0]["id"]]})
    if status!=200: raise RuntimeError(f"reject: {status} {decision_payload}")
    detail=decision_payload;expect(detail["status"],"partially_approved","partial status")
    status,detail=kskdt.request("POST",f"/api/kaskdt/applications/{app_id}/finalize",{"applicationVersion":detail["version"]});expect(status,200,"finalize")
    if not detail["finalizedAt"]:raise RuntimeError("application not finalized")
    approved=[x for x in detail["entries"] if x["status"]=="approved"]
    if len(approved)!=1 or not approved[0]["createdVisitId"]:raise RuntimeError("approved visit missing")
    expect(sibe.request("PATCH","/api/sibe/settings/public-xlsx-applications",{"requireEmailVerification":True})[0],200,"restore verification")
    print(json.dumps({"success":True,"reference":created["reference"],"applicationId":app_id,"approved":1,"rejected":1}))

if __name__=="__main__":main()
