FROM python:3.12-slim

ENV HOST=0.0.0.0 PORT=8090 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid 10001 --no-create-home appuser
COPY server.py ./server.py
COPY static ./static
EXPOSE 8090
USER 10001:10001
CMD ["python", "server.py"]
