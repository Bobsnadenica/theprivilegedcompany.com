import asyncio,aiohttp,json,pathlib,time
root=pathlib.Path(__file__).parent
job=json.loads((root/'job.json').read_text())['prompt_id']
async def main():
 async with aiohttp.ClientSession() as s:
  async with s.ws_connect('http://127.0.0.1:8188/ws?clientId=tpc-promo-monitor') as ws:
   start=time.time()
   while True:
    try:
     m=await ws.receive(timeout=15)
     if m.type==aiohttp.WSMsgType.TEXT:
      d=json.loads(m.data)
      if d.get('type') in ['progress','executing','execution_error','execution_success']:print(json.dumps(d),flush=True)
    except asyncio.TimeoutError:pass
    async with s.get('http://127.0.0.1:8188/history/'+job) as r:h=await r.json()
    if job in h:
     (root/'history.json').write_text(json.dumps(h[job],indent=2));print('TERMINAL',json.dumps(h[job]['status']),flush=True);return
    print('elapsed',int(time.time()-start),flush=True)
asyncio.run(main())
