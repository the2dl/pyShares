# pyShare - Python-based Active Directory File Share Scanner

A Python-based network share scanner that enumerates and analyzes SMB shares across a Windows domain environment. 

The platform utilizes various chunks of [impacket](https://github.com/SecureAuthCorp/impacket) to prevent code-re-use/re-create. 

## Features

- Domain-integrated scanning using LDAP authentication
- Multi-threaded share enumeration
- Detection of sensitive files based on patterns
- PostgreSQL database storage for results
- Rich CLI interface with detailed reporting
- CSV export capabilities

## Prerequisites

- Python 3.8+
- PostgreSQL database
- Domain user credentials with appropriate access
- Network access to target domain controller and shares

## Installation

1. Clone the repository
2. Create a virtual environment:

```
python -m venv venv
source venv/bin/activate # Linux/Mac (Tested from Linux)
venv\Scripts\activate # Windows
```

Install dependencies:

python
pip install -r requirements.txt

Create a `.env` file with database configuration:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fileshare_db
DB_USER=fileshare_scanner
DB_PASSWORD=your_password
```

## Postgres

`dockerfile-compose.yaml` will need to be modified to fit your needs (username/password)

Then run it with `docker exec -it postgres psql -U postgres`

If you need to quickly review it, you can do `docker exec -it docker-postgres-1 psql -U fileshare_scanner -d fileshare_db` and `\dt` to review.

## Usage

Basic scan of domain computers:

`python src/main.py --dc DC01.domain.local --domain domain.local`

Additional options:
```
    --dc                        TEXT     Domain controller hostname or IP [default: None] [required]
    --domain                    TEXT     Domain name (e.g., company.local) [default: None] [required]
    --port                      INTEGER  LDAP port number [default: 389]
    --threads                   INTEGER  Number of concurrent scan threads (default: 10) [default: 10] 
    --ou                        TEXT     Specific OU to scan [default: None]
    --filter                    TEXT     LDAP filter for computer search [default: all]
    --batch-size                INTEGER  Number of hosts to process in each batch [default: 1000]
    --install-completion                 Install completion for the current shell.
    --show-completion                    Show completion for the current shell, to copy it or customize the installation. 
    --help                               Show this message and exit.
```

## Components

1. **Scanner**: Core scanning engine for share enumeration
2. **Pattern Matcher**: Sensitive file detection patterns
3. **Report Generator**: Generates detailed reports

## Database Schema

The application uses PostgreSQL with the following main tables:
- `shares`: Main share information
- `share_permissions`: Share permission details
- `sensitive_files`: Detected sensitive files
- `root_files`: Root directory listings

## Security Considerations

- Requires domain user credentials (local or admin depending on what you want to pull back)
- Stores credentials only in memory during runtime
- Logs sensitive file locations securely
- Uses connection pooling for database operations

## Contributing

Contributions are welcome!