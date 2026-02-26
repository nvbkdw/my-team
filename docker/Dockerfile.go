FROM my-team-base:latest

# Install Go toolchain
RUN curl -fsSL https://go.dev/dl/go1.22.5.linux-amd64.tar.gz | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:${PATH}"

LABEL my-team.image-type="go"
