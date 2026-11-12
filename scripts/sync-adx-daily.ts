/** One scheduler entry point. Attempt both publications even if one fails. */
import {spawnSync} from 'node:child_process'
const args=process.argv.slice(2)
let failed=false
for(const script of ['scripts/sync-adx-daily-brief.ts','scripts/sync-adx-daily-boards.ts']){
 const result=spawnSync(process.execPath,['--import','tsx',script,...args],{stdio:'inherit',cwd:process.cwd(),timeout:180000})
 if(result.error||result.status!==0){failed=true;console.error(`${script} 同步未完成，请查看上方错误；另一同步步骤仍会执行。`)}
}
process.exitCode=failed?1:0
