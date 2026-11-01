FROM python:3.12-slim

WORKDIR /srv

COPY pyproject.toml ./
COPY app ./app
COPY sql ./sql
COPY scripts ./scripts

# Editable install, so pyproject stays the single list of dependencies and the container runs
# the files that are checked in.
RUN pip install --no-cache-dir -e . \
    && useradd --create-home --uid 1000 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"

# Load the CSVs, then serve. The loader drops and rebuilds everything, so a restart is harmless
# and a fresh container always matches a fresh database.
CMD ["sh", "-c", "python -m scripts.load_data && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
