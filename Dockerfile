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

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY mark1_pilot/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY . /app
COPY --from=showroom-build /app/showroom/dist /app/showroom/dist

ENV SUPERMEGA_SITE_ROOT=/app/showroom/dist
ENV SUPERMEGA_PILOT_DATA=/app/pilot-data
ENV SUPERMEGA_HOST=0.0.0.0
ENV PORT=8080

RUN mkdir -p /app/pilot-data

EXPOSE 8080

CMD ["python", "tools/serve_solution.py"]
