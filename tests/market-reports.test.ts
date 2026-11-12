import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {parseReport} from '../src/lib/market/report-parser'
import {resolveCitation,textUnits,REPORT_SOURCE,type ReportRecord} from '../src/lib/market/report-types'
import {linkSnapshot,linkSchema,IDEA_EVIDENCE_SOURCE} from '../src/lib/market/idea-evidence'
import {evidenceSchema,evidenceText,type EvidenceRecord} from '../src/lib/market/evidence'
import {isBoardImport} from '../src/lib/market/import-scope'
const id='00000000-0000-4000-8000-000000000001'
const report:ReportRecord={id,created_at:'2026-11-12T01:00:00Z',updated_at:'2026-11-12T01:00:00Z',payload:{kind:'report',fileName:'报告.txt',size:20,extension:'txt',storagePath:'private/original',sha256:'abc',status:'已解析',actor:'a'}}
function pdf(texts:string[]){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Kids [${texts.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${texts.length} >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
 for(let i=0;i<texts.length;i++){const stream=texts[i]?`BT /F1 12 Tf 50 700 Td (${texts[i]}) Tj ET`:'';objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)}
 let file='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(file));file+=`${i+1} 0 obj\n${o}\nendobj\n`});const start=Buffer.byteLength(file);file+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(file)
}
test('text source locations preserve blank lines, CRLF and original line numbers',async()=>{
 const result=await parseReport(Buffer.from('\uFEFF标题\r\n\r\n第三行事实\r\n第四行'),'md')
 assert.equal(result.units[1].id,'line-3');assert.equal(result.units[1].text,'第三行事实');assert.equal(result.status,'已解析')
 assert.equal(textUnits('第一段\n\n第二段','docx')[1].label,'提取段落 2（非页码）')
})
test('PDF returns physical page locations, marks unreadable pages and rejects fully empty scans',async()=>{
 const result=await parseReport(pdf(['First page fact','','Third page fact']),'pdf')
 assert.equal(result.units.length,3);assert.equal(result.units[2].page,3);assert.match(result.units[2].text,/Third page fact/);assert.equal(result.emptyUnits,1);assert.equal(result.status,'部分可读')
 await assert.rejects(parseReport(pdf(['']),'pdf'),/没有可提取文字/)
})
test('DOCX extracts paragraphs while preserving no claim of original pagination',async()=>{
 const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>第一段事实</w:t></w:r></w:p><w:p><w:r><w:t>第二段范围</w:t></w:r></w:p></w:body></w:document>')
 const result=await parseReport(await zip.generateAsync({type:'nodebuffer'}),'docx');assert.equal(result.units.length,2);assert.equal(result.units[1].text,'第二段范围');assert.match(result.units[1].label,/非页码/)
})
test('invalid encodings, disguised files and oversized parsed output fail explicitly',async()=>{
 await assert.rejects(parseReport(Buffer.from('not a zip'),'docx'),/有效DOCX/)
 await assert.rejects(parseReport(Buffer.from('<html>failure</html>'),'pdf'),/有效PDF/)
 await assert.rejects(parseReport(Buffer.from([0xff,0xfe,0xff]),'txt'),/UTF-8/)
 await assert.rejects(parseReport(Buffer.from('a\u0000b'),'txt'),/二进制/)
 await assert.rejects(parseReport(Buffer.from('字'.repeat(510000)),'txt'),/未截断/)
})
test('citation must resolve exact original text in the selected document unit',()=>{
 const units=textUnits('第一行\n\n第三行事实','txt'),ref={reportId:id,unitId:'line-3',quote:'第三行事实'}
 const cite=resolveCitation(report,units,ref);assert.equal(cite.label,'第 3 行');assert.equal(cite.sha256,'abc')
 assert.throws(()=>resolveCitation(report,units,{...ref,unitId:'line-1'}),/不匹配/)
 assert.throws(()=>resolveCitation(report,units,{...ref,quote:'改写的事实'}),/不匹配/)
 assert.throws(()=>resolveCitation({...report,id:'another'},units,ref))
 assert.throws(()=>resolveCitation({...report,payload:{...report.payload,status:'解析失败'}},units,ref))
})
test('topic links freeze only the selected verified version and retain report attribution',()=>{
 const payload=evidenceSchema.parse({title:'证据',type:'调研记录',period:'',source:'报告',url:'',publishedDate:'',scope:'范围',locator:'第3行',excerpt:'事实',fact:'事实',judgment:'判断',action:'核验',work:'',stance:'背景资料',status:'已核验'})
 const r:EvidenceRecord={id,created_at:'now',updated_at:'v1',payload:{...payload,kind:'evidence',actor:'a',verifiedAt:'now',verifiedBy:'a',citation:{reportId:id,unitId:'line-3',quote:'事实',fileName:'报告.txt',sha256:'abc',label:'第 3 行'}}}
 const frozen=linkSnapshot(r,'v1');r.payload.fact='新版';r.payload.status='已归档';assert.equal(frozen.payload.fact,'事实');assert.match(evidenceText(frozen),/报告.txt.*第 3 行/)
 assert.throws(()=>linkSnapshot(r,'v1'),/尚未核验/);r.payload.status='已核验';assert.throws(()=>linkSnapshot(r,'stale'),/已变化/)
 assert.equal(linkSchema.safeParse({ideaId:id,evidenceId:id,evidenceVersion:'v1',purpose:'背景参考',reason:''}).success,false)
 assert.equal(isBoardImport({source_name:REPORT_SOURCE}),false);assert.equal(isBoardImport({source_name:IDEA_EVIDENCE_SOURCE}),false)
})
