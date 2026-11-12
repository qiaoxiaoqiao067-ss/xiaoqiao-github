import mammoth from 'mammoth'
import {textUnits,type ReportUnit} from './report-types'
export async function parseReport(buffer:Buffer,extension:string){
 let units:ReportUnit[]=[]
 if(extension==='pdf'){
  if(!buffer.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('文件内容不是有效PDF，请检查文件格式')
  await import('pdf-parse/worker');const {PDFParse}=await import('pdf-parse');const parser=new PDFParse({data:new Uint8Array(buffer)})
  try{const result=await parser.getText();if(result.total>300)throw new Error('报告超过300页，请分章节上传');units=result.pages.map(p=>({id:`page-${p.num}`,label:`PDF第 ${p.num} 页`,page:p.num,text:p.text.trim()}))}finally{await parser.destroy()}
 }else if(extension==='docx'){
  if(buffer[0]!==0x50||buffer[1]!==0x4b)throw new Error('文件并非有效DOCX，请用Word另存为.docx后重试')
  units=textUnits((await mammoth.extractRawText({buffer})).value,'docx')
 }else if(extension==='txt'||extension==='md'){
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch{throw new Error('文本编码不是UTF-8，请转换编码后重新上传')}
  if(text.includes('\u0000'))throw new Error('文件包含二进制内容，不能作为文本解析');units=textUnits(text,extension)
 }else throw new Error('支持PDF、DOCX、TXT、Markdown')
 if(units.length>20000||Buffer.byteLength(JSON.stringify(units),'utf8')>1500000)throw new Error('提取正文过长，请分章节上传；未截断正文')
 if(!units.some(u=>u.text.trim()))throw new Error('没有可提取文字，可能为扫描件；原附件保留，请上传带文字层版本或另行粘贴核对后的摘录')
 const emptyUnits=units.filter(u=>!u.text.trim()).length
 return {units,emptyUnits,status:emptyUnits?'部分可读' as const:'已解析' as const}
}
