"""Owned disposable PostgreSQL + real loopback HTTP for browser acceptance.

No external DSN accepted. Synthetic session is deliberately not Supabase Auth.
POST /__qa/stop with X-Supermega-QA: stop-owned-fixture to stop and clean up.
"""
import json
import os
from pathlib import Path
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    if os.environ.get('SUPERMEGA_INQUIRY_BROWSER_QA') != '1':
        raise SystemExit('Set SUPERMEGA_INQUIRY_BROWSER_QA=1 for this disposable local fixture.')
    import uvicorn
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.staticfiles import StaticFiles
    from tests.test_website_media_postgres import _local_database
    from tests.test_website_inquiry_followup import InquiryFollowupTests
    from supermega_runtime.trial_store import PostgresTrialStore
    from supermega_runtime.website_runtime import reduce_website_state
    from supermega_runtime.website_inquiry_api import create_website_inquiry_router
    from tests.test_website_published_media import ORIGIN

    output = ROOT / '.tmp/qa-workspaces'
    evidence = ROOT / '.tmp/sites-inquiry-followup-20261010'
    with _local_database() as (admin, runtime):
        fixture = InquiryFollowupTests('test_http_contract_filters_and_conflict_are_safe')
        fixture.admin = admin
        fixture.store = PostgresTrialStore(runtime, reducer=lambda surface,event,state,payload: reduce_website_state(event,state,payload),write_enabled=True)
        fixture.setUp()
        fixture._sql('update app_private.website_inbox set name=%s, message=%s where workspace_id=%s',
                     ('Daw Su','မင်္ဂလာပါ။ လူ ၂၀ အတွက် စားပွဲ ကြိုတင်မှာယူချင်ပါတယ်။ ဈေးနှုန်း သိချင်ပါတယ်။',fixture.owner.workspace_id))
        for name,message in [('Ko Min','Could you share your catering menu for an office lunch next Friday?'),('May','Are you open on Sunday morning?')]:
            fixture.adapter.receive(channel_id=fixture.channel,request_id=str(uuid4()),origin=ORIGIN,
                payload={'name':name,'contact':'synthetic@example.test','message':message,'consent':True},client_key='b'*64)
        (output/'inquiry/identity.json').write_text(json.dumps({'userId':fixture.owner.actor_id,'workspaceId':fixture.owner.workspace_id,'email':''}),encoding='utf-8')

        app=FastAPI()
        def principal(request):
            if (request.headers.get('authorization')!='Bearer synthetic-local-inquiry-qa'
                    or request.headers.get('x-supermega-workspace-id')!=fixture.owner.workspace_id):
                raise ValueError('synthetic_sign_in_required')
            return fixture.owner
        app.include_router(create_website_inquiry_router(store=fixture.adapter,enabled=True,
            resolve_principal=principal,resolve_client_address=lambda _: '192.0.2.1',
            abuse_key=bytes(range(32)),public_origin=ORIGIN))
        server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=4187,access_log=False,log_level='warning'))
        @app.post('/__qa/stop')
        async def stop(request: Request):
            if request.client.host!='127.0.0.1' or request.headers.get('x-supermega-qa')!='stop-owned-fixture':
                raise HTTPException(403)
            server.should_exit=True
            return {'stopping':True}
        app.mount('/',StaticFiles(directory=output,html=True))
        print('LOCAL_INQUIRY_QA_PREPARED; verify HTTP at http://127.0.0.1:4187/inquiry/',flush=True)
        try:
            server.run()
        finally:
            rows=fixture._sql('select operation,receipt from app_private.website_inquiry_actions where workspace_id=%s order by created_at',(fixture.owner.workspace_id,))
            (evidence/'browser-database-actions.json').write_text(json.dumps({'synthetic':True,'actions':[{'operation':r[0],'receipt':r[1]} for r in rows]},indent=2),encoding='utf-8')
    print('LOCAL_INQUIRY_QA_DATABASE_STOPPED',flush=True)


if __name__=='__main__':
    main()
