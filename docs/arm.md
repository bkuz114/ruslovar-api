The cleanest way to build multi-arch on Windows is with `docker buildx`. It's built into Docker Desktop and handles both amd64 and arm64 in a single command.

## 1. Create a buildx builder

```bash
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap
```

This creates a builder instance that supports multi-platform builds.

## 2. Install QEMU emulation

```bash
docker run --privileged --rm tonistiigi/binfmt --install all
```

This registers the ARM64 emulation handlers so your x86_64 machine can build ARM64 images.

## 3. Build and push both architectures directly to Docker Hub

database image:

**Go to `ruslovar-db` repo**

```bash
docker buildx build --platform linux/amd64,linux/arm64 -f Dockerfile -t ikzv/runouns-db:0.2.0 -t ikzv/runouns-db:latest --push .
```

API image:

**Go to `ruslovar-api` repo**

```bash
docker buildx build --platform linux/amd64,linux/arm64 -f docker/api.Dockerfile -t ikzv/ruslovar-api:0.2.0 -t ikzv/ruslovar-api:latest --push .
```

Demo image:

**Go to `ruslovar-api` repo**

```bash
docker buildx build --platform linux/amd64,linux/arm64 -f docker/demo.Dockerfile -t ikzv/ruslovar-demo:0.2.0 -t ikzv/ruslovar-demo:latest --push .
```

The `--push` flag pushes directly to Docker Hub as part of the build. No separate push step needed.

## 4. Verify the manifest list

```bash
docker buildx imagetools inspect ikzv/runouns-db:latest
docker buildx imagetools inspect ikzv/ruslovar-api:latest
docker buildx imagetools inspect ikzv/ruslovar-demo:latest
```

You should see both `linux/amd64` and `linux/arm64` listed under `Platforms`.

Users on both x86_64 and ARM64 machines will pull the correct variant automatically.

(The builds will take slightly longer than single-arch because Docker is building both variants, with the ARM64 build running under emulation. But these images, mostly file copies and config, should be quick.)
