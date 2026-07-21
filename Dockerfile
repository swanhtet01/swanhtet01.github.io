FROM node:22-bookworm-slim AS showroom-build
WORKDIR /app/showroom
COPY showroom/package*.json ./
RUN npm ci
COPY showroom/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY api /app/api
COPY supermega_runtime /app/supermega_runtime
COPY api_app.py /app/api_app.py
COPY --from=showroom-build /app/showroom/dist /app/showroom/dist

ENV PORT=8080

EXPOSE 8080

CMD ["sh", "-c", "uvicorn api_app:app --host 0.0.0.0 --port ${PORT:-8080}"]
