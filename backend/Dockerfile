# R28 official rhwp Linux runtime — dedicated origin, not a Cloudflare Worker.
FROM python:3.12-slim-trixie
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install --no-install-recommends -y \
    ca-certificates curl tar bubblewrap util-linux fontconfig fonts-noto-cjk \
    libfontconfig1 libfreetype6 libstdc++6 libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv/sunrise
# Verified source archive created from the R27 inherited API + R28 HMAC adapter.
COPY backend/r28_backend_runtime.tar.gz /tmp/sunrise-runtime.tar.gz
RUN echo 'c7b430c663f41491922855704df065f81eebfd9fb3e732de404356d113c1f9c4  /tmp/sunrise-runtime.tar.gz' | sha256sum -c - \
    && tar -xzf /tmp/sunrise-runtime.tar.gz -C /srv/sunrise \
    && rm /tmp/sunrise-runtime.tar.gz
RUN python -m pip install --disable-pip-version-check \
    'fastapi>=0.115,<1' 'uvicorn>=0.30,<1' 'python-multipart>=0.0.9,<1' \
    'pymupdf>=1.24,<2' 'pydantic>=2,<3'
# Official v0.8.7 x86_64 GitHub release, pinned SHA-256 from GitHub asset metadata.
ARG RHWP_TAR_SHA256=f1e541a25cfe76b6bc1daf18bf9c1f9a5ac5e03e2c01b188daaf54107214f631
RUN set -eux; \
    curl --fail --location --retry 3 --connect-timeout 15 --max-time 180 \
      -o /tmp/rhwp.tar.gz \
      'https://github.com/edwardkim/rhwp/releases/download/v0.8.7/rhwp-v0.8.7-linux-x86_64.tar.gz'; \
    echo "$RHWP_TAR_SHA256  /tmp/rhwp.tar.gz" | sha256sum -c -; \
    mkdir -p /tmp/rhwp-unpack /etc/sunrise; \
    tar -xzf /tmp/rhwp.tar.gz -C /tmp/rhwp-unpack; \
    exe="$(find /tmp/rhwp-unpack -type f -name rhwp -print -quit)"; \
    test -n "$exe"; \
    cp "$exe" /usr/local/bin/rhwp; chmod 0755 /usr/local/bin/rhwp; \
    /usr/local/bin/rhwp --version | grep -F 'rhwp v0.8.7'; \
    sha256sum /usr/local/bin/rhwp | cut -d' ' -f1 > /etc/sunrise/rhwp-bin.sha256; \
    rm -rf /tmp/rhwp.tar.gz /tmp/rhwp-unpack
COPY backend/docker-entrypoint.sh /usr/local/bin/sunrise-entrypoint
RUN chmod 0755 /usr/local/bin/sunrise-entrypoint && \
    useradd --system --uid 11001 --home-dir /srv/sunrise --shell /usr/sbin/nologin sunrise && \
    mkdir -p /var/lib/sunrise && chown 11001:11001 /var/lib/sunrise
ENV SUNRISE_WEB_DATA=/var/lib/sunrise \
    SUNRISE_RHWP_CLI=/usr/local/bin/rhwp \
    SUNRISE_RHWP_EXPECTED_VERSION=0.8.7
USER 11001:11001
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/sunrise-entrypoint"]
