# Imagen para Hugging Face Spaces (SDK Docker, puerto 7860) o cualquier servidor con Docker.
FROM python:3.12-slim

RUN useradd -m -u 1000 user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH PYTHONUNBUFFERED=1 \
    HF_HOME=/home/user/.cache/huggingface WHISPER_MODEL=small
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

USER user
# Descarga Whisper durante el build: el primer audio del demo no espera la descarga.
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

COPY --chown=user . .
EXPOSE 7860
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
