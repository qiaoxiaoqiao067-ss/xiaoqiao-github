import test from 'node:test'
import assert from 'node:assert/strict'
import { detectMonthlyBoard, detectSheetMonth, monthFromValue, monthlyImportRows } from '../src/lib/market/monthly-import'
import { ADX_PLATFORMS, latestBoardImports, marketBoardKey } from '../src/lib/market/monitoring-policy'
import { requestedImports } from '../src/lib/market/import-scope'
import { boardSamples } from '../src/lib/market/board-analysis'

test('October through December are parsed completely; invalid months are rejected', () => {
  for (let month = 1; month <= 12; month++) {
    const key = `2026-${String(month).padStart(2, '0')}`
    assert.equal(monthFromValue(`短剧排行榜_${key}_总素材数_Top5000.xlsx`), key)
    assert.equal(monthFromValue(`2026年${month}月`), key)
  }
  for (const bad of ['2026-00', '2026-13', '2026-101']) assert.equal(monthFromValue(bad), '')
  assert.deepEqual(detectSheetMonth('unknown.xlsx', 'Sheet0', [{月份:'2026-10',上线时间:'2026-11-01'}]), {value:'2026-10',evidence:'表内字段：月份'})
  assert.equal(detectSheetMonth('unknown.xlsx', 'Sheet0', [{上线时间:'2026-11-01'}]).value, '')
})

test('all 13 platform exports remain platforms for both playback and heat schemas', () => {
  for (const platform of ADX_PLATFORMS) for (const metric of ['播放增量','热度']) {
    const name = `${platform}_2026-10_${metric}_Top5000.xlsx`
    assert.equal(detectMonthlyBoard(name,'Sheet0',['排行','剧名','标签',metric]),'platform')
    // Old accidental markers cannot override an explicit platform filename.
    assert.equal(detectMonthlyBoard(name,'Sheet0',['排行','剧名',metric,'__market_signal_tk'],'ADX月榜:tk:old'),'platform')
  }
  assert.equal(detectMonthlyBoard('TikTok短剧热播榜_2026-10_播放增量_Top5000.xlsx','Sheet0',['排行','剧名','播放增量']),'tk')
  assert.equal(detectMonthlyBoard('短剧排行榜_2026-10_总素材数_Top5000.xlsx','Sheet0',['排名','剧名','总素材数']),'ad')
  assert.equal(detectMonthlyBoard('短剧平台榜.xlsx','Sheet0',['播放增量']),'platform')
  assert.equal(detectMonthlyBoard('custom.xlsx','Sheet0',['剧场号','播放增量']),'tk')
})

test('new upload and prior filenames share a board identity; latest versions do not erase history', () => {
  const oldName='2026-10-短剧月榜.xlsx', newName='短剧排行榜_2026-10_总素材数_Top5000.xlsx'
  assert.equal(marketBoardKey('ADX',oldName),marketBoardKey('ADX月榜:ad:new',newName))
  const source=(id:string,file_name:string,period_label:string,created_at:string)=>({id,source_name:'ADX月榜:ad:upload',file_name,period_label,created_at,updated_at:created_at})
  const inputs=[source('old',oldName,'2026年10月','2026-11-01'),source('new',newName,'2026年10月','2026-11-26'),source('sep','短剧榜_月榜_2026-09.xlsx','2026年9月','2026-11-20'),source('platform','DramaBox_2026-10_播放增量.xlsx','2026年10月','2026-11-26')]
  assert.deepEqual(latestBoardImports(inputs).map(x=>x.id).sort(),['new','platform','sep'])
  assert.deepEqual(requestedImports(inputs,'2026年10月','2026年9月').map(x=>x.id).sort(),['new','platform','sep'])
  assert.equal(inputs.length,4)
  assert.equal(latestBoardImports([inputs[0],{...inputs[1],period_label:'2026-10'}]).length,1)
  const tikOld=source('tk-old','2026-10-TK短剧热播月榜.xlsx','2026年10月','2026-11-01')
  const tikNew=source('tk-new','TikTok短剧热播榜_2026-10_播放增量_Top5000.xlsx','2026年10月','2026-11-26')
  assert.deepEqual(latestBoardImports([tikOld,tikNew]).map(x=>x.id),['tk-new'])
})

test('provenance enriches copies while preserving playback values, nulls, and raw input', () => {
  const raw=[{排行:1,剧名:'Example',播放增量:1250,播放总量:null}]
  const [row]=monthlyImportRows('DramaBox_2026-10_播放增量_Top5000.xlsx','platform',raw)
  assert.deepEqual(row,{...raw[0],平台:'DramaBox',采集排序:'播放增量'})
  assert.deepEqual(raw,[{排行:1,剧名:'Example',播放增量:1250,播放总量:null}])
})

test('already uploaded exports keep their filename-established total-material sorting', () => {
  const [sample] = boardSamples([{source_name:'ADX月榜:ad:upload',file_name:'短剧排行榜_2026-08_总素材数_Top5000.xlsx',period_label:'2026年8月',created_at:'2026-11-25',raw_rows:[{排名:1,剧名:'Example',标签:'AI仿真人',总素材数:500,新素材数:20}]}],'month')
  assert.equal(sample.sort,'总素材数')
  assert.equal(sample.metric,'总素材数')
})
