import os
import urllib.request, urllib.error, json, sys

BASE='http://127.0.0.1:8000'
TOKEN=os.environ.get('TEST_AUTH_TOKEN', '').strip()

headers={'Content-Type':'application/json'}
if TOKEN:
    headers['Authorization'] = f'Bearer {TOKEN}'

def do_get(path):
    req=urllib.request.Request(BASE+path, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print('GET', path, r.status, r.read().decode())
    except urllib.error.HTTPError as e:
        print('GET', path, 'HTTP', e.code, e.read().decode())
    except Exception as e:
        print('GET', path, 'ERR', e)

def do_post(path, data):
    b=json.dumps(data).encode()
    req=urllib.request.Request(BASE+path, headers=headers, data=b, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print('POST', path, r.status, r.read().decode())
    except urllib.error.HTTPError as e:
        print('POST', path, 'HTTP', e.code, e.read().decode())
    except Exception as e:
        print('POST', path, 'ERR', e)

if __name__=='__main__':
    if not TOKEN:
        print('Missing TEST_AUTH_TOKEN in environment; /me may fail with 401.')
    do_get('/me')
    cfg={
        'uiLanguage':'pt-BR',
        'interviewLanguage':'pt-BR',
        'track':'backend',
        'seniority':'mid',
        'stacks':['python'],
        'style':'standard',
        'duration':30,
        'plan':'standard'
    }
    do_post('/sessions/start', cfg)
