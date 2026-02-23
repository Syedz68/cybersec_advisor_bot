# Cyber Security Advisor Bot

**Cyber Security** Advisor is a privacy-preserving, RAG-based AI chatbot that delivers accurate, citation-backed cybersecurity guidance grounded in authoritative standards such as NIST, OWASP, CERT, MITRE ATT&CK, and CIS Controls.

## Overview

Most cyber incidents stem from a lack of security awareness among everyday users. Existing solutions — whether rule-based systems or cloud-only LLM chatbots — fall short: they either lack depth, raise privacy concerns, or hallucinate unsupported answers. Cyber Security Advisor solves this by combining Retrieval-Augmented Generation (RAG) with a dual-mode LLM inference architecture, giving users a choice between full privacy and high performance.

## How It Works

The system is built on three core modules:

- **Knowledge Ingestion & Indexing**: Documents from NIST SP 800 series, OWASP Top 10, CISA, CERT, SANS, and more are parsed (PDF, HTML, XML, CSV), chunked (800 tokens, 120 token overlap), and embedded using sentence-transformers/all-MiniLM-L6-v2 into a Qdrant vector database with cosine similarity indexing.
- **Semantic Retrieval**: User queries are embedded using the same model, and the top-4 most relevant chunks are retrieved via cosine similarity search, forming a grounded prompt context.
- **Dual-Mode Answer Generation**: Responses are generated strictly from retrieved context with mandatory source citations ([URL]) -
  - **Local Mode**: Uses Llama 3.2 via Ollama for fully offline, privacy-preserving inference.
  - **Cloud Mode**: Uses GPT-4o-mini via OpenAI API for improved speed and response quality.

## Tech Stack

- **Embeddings**: sentence-transformers/all-MiniLM-L6-v2
- **Vector DB**: Qdrant
- **Local LLM**: Llama 3.2 (via Ollama)
- **Cloud LLM**: GPT-4o-mini (via OpenAI API)
- **Document Parsing**: BeautifulSoup4, PyPDF2, Python XML/CSV libraries

## Project Structure

The organized project structure is given below:
```
cybersec_advisor_bot/
├── docker-compose.yml              # Orchestrates all services (API, Qdrant, Ollama, Frontend)
│
├── backend/                        # Django REST API
│   ├── advisor/
│   │   ├── __init__.py
│   │   ├── apps.py
│   │   └── views.py                # All API logic: ingestion, RAG, LLM calls, analysis
│   ├── core/
│   │   ├── settings.py             # Django settings
│   │   ├── urls.py                 # API route definitions
│   │   ├── asgi.py
│   │   └── wsgi.py
│   ├── templates/
│   │   └── index.html
│   ├── manage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env                        # Your local environment variables
│   └── .env.example                # Template for environment setup
│
└── frontend/                       # Next.js UI
    ├── pages/
    │   ├── _app.js
    │   └── index.js                # Main chat interface
    ├── next.config.js
    ├── package.json
    ├── Dockerfile
    ├── .env.local
    └── .env.example
```

