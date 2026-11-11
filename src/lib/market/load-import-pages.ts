/** Fetch bounded responses; publish the complete snapshot only after every page succeeds. */
export async function loadImportPages<T extends {id:string; updated_at:string}>(metadata:T[], getPage:(id:string,offset:number)=>Promise<{rows:Record<string,unknown>[];total:number;updated_at:string}>) {
  const results: (T & {raw_rows:Record<string,unknown>[]})[] = new Array(metadata.length)
  let cursor=0
  await Promise.all(Array.from({length:Math.min(4,metadata.length)},async()=>{
    while(cursor<metadata.length){
      const index=cursor++, item=metadata[index], rows:Record<string,unknown>[]=[]
      let total=Infinity
      do {
        const page=await getPage(item.id,rows.length)
        if(page.updated_at!==item.updated_at) throw new Error('榜单在读取时更新，请重新连接以获取完整版本。')
        if(!Number.isInteger(page.total)||page.total<0||page.total>10000||(!page.rows.length&&page.total>rows.length)||page.rows.length>1000) throw new Error('榜单分页不完整，请重新连接。')
        if(total!==Infinity && total!==page.total) throw new Error('榜单条数在读取时变化，请重新连接。')
        total=page.total;rows.push(...page.rows)
        if(rows.length>total) throw new Error('榜单分页条数不一致。')
      } while(rows.length<total)
      results[index]={...item,raw_rows:rows}
    }
  }))
  return results
}
