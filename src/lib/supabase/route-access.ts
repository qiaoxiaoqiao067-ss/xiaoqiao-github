export const SHARED_PAGES = {'/content':'content','/projects':'projects','/market-data':'market_data','/discover':'discover'} as const
const personalPages=['/todos','/reports','/docs','/ai-learning','/research','/meetings','/knowledge','/localization','/settings']
const personalApis=['/api/tasks','/api/reports','/api/documents','/api/generate-report','/api/weekly-report','/api/meetings','/api/knowledge-files','/api/ai-learning','/api/localization']
const personalTables=['todos','habits','habit_logs','meetings','research_items','knowledge_items']
const within=(path:string,root:string)=>path===root||path.startsWith(root+'/')
export function routeAccess(path:string):'owner'|keyof typeof SHARED_PAGES|'public'{
 try{path=decodeURIComponent(path)}catch{return 'owner'}
 if(path==='/'||personalPages.some(p=>within(path,p))||personalApis.some(p=>within(path,p)))return 'owner'
 if(personalTables.some(t=>within(path,`/api/supabase/rest/v1/${t}`)))return 'owner'
 for(const root of Object.keys(SHARED_PAGES) as (keyof typeof SHARED_PAGES)[])if(within(path,root))return root
 return 'public'
}
