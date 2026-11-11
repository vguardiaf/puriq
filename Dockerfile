# Imagen para Render (plan gratis), Hugging Face Spaces (puerto 7860) o cualquier servidor con Docker.
FROM python:3.12-slim

# Tamaño de Whisper: "small" en servidores con ≥2 GB; "tiny" en planes gratis de 512 MB (Render lo pasa como build arg).
ARG WHISPER_MODEL=small

RUN useradd -m -u 1000 user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1 \
    HF_HOME=/home/user/.cache/huggingface WHISPER_MODEL=${WHISPER_MODEL}
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

USER user
# Descarga Whisper durante el build: el primer audio del demo no espera la descarga.
RUN python -c "import os; from faster_whisper import WhisperModel; WhisperModel(os.environ['WHISPER_MODEL'], device='cpu', compute_type='int8')"

COPY --chown=user . .
EXPOSE 7860
# Render asigna el puerto en $PORT; en otros lados, 7860.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
