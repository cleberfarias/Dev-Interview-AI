from backend.app.services import company_service
from backend.app.schemas.company import CompanyCreateRequest

def main():
    # UID created previously for cleber.delgado@chatguru.com.br
    user = {"uid": "rvd6LXBIDEaX6LVXVOFcEDYh0ih1", "email": "cleber.delgado@chatguru.com.br", "name": "Cleber Delgado"}
    req = CompanyCreateRequest(name='ChatGuru', plan='business', hrName='Cleber Delgado', hrEmail='cleber.delgado@chatguru.com.br')
    ctx = company_service.create_company(user, req)
    print('Created company id=', ctx.company.id)
    print('Membership=', ctx.membership.dict())

if __name__ == '__main__':
    main()
