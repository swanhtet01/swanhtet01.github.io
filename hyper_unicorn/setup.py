from setuptools import setup, find_packages

setup(
    name="hyper-unicorn",
    version="1.0.0",
    author="Manus AI",
    author_email="contact@supermega.dev",
    description="AI Agent Infrastructure for SuperMega.dev",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    url="https://github.com/swanhtet01/swanhtet01.github.io/tree/main/hyper_unicorn",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.10",
    install_requires=[
        "fastapi>=0.104.0",
        "uvicorn>=0.24.0",
        "httpx>=0.25.0",
        "redis>=5.0.0",
        "qdrant-client>=1.7.0",
        "google-generativeai>=0.3.0",
        "anthropic>=0.8.0",
        "openai>=1.3.0",
        "pydantic>=2.5.0",
        "python-dotenv>=1.0.0",
        "streamlit>=1.29.0",
        "plotly>=5.18.0",
        "pandas>=2.1.0",
        "numpy>=1.26.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-asyncio>=0.21.0",
            "black>=23.0.0",
            "ruff>=0.1.0",
        ],
        "browser": [
            "playwright>=1.40.0",
        ],
        "research": [
            "tavily-python>=0.3.0",
            "exa-py>=1.0.0",
        ],
        "sandbox": [
            "e2b>=0.14.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "hyper-unicorn=hyper_unicorn.cli:main",
        ],
    },
)
