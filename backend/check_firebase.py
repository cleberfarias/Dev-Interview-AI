from app.firebase_admin import init_firebase

if __name__ == '__main__':
    try:
        init_firebase()
        print('INIT_OK')
    except Exception as e:
        import traceback
        traceback.print_exc()
        print('INIT_ERROR:', str(e))
