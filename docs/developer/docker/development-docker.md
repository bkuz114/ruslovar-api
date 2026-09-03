# Docker development

This is a guide for any development related to the Docker container portion of the project.

`ruslovar-api` consists of three components: a MySQL database, a FastAPI server, and a static demo page.

All three can run together in a containerized environment (one container for each component), and can be set up easily via `docker compose up` using the `compose.yml` file in the repo's root.

The Docker images for each container are on Docker Hub, and `compose.yml` pulls them from there (via `:latest` tag on each).

In order for users to get the latest code changes in the FastAPI server, the demo page, or updates to the database dump, will need to generate new images and upload them to Docker hub with a new :latest tag. This guide shows how to do that.

## Building new Images

As mentioned, ruslovar-api consists of three components: a MySQL database, a FastAPI server, and a static demo page, and each exist as Docker images available on Docker hub, which users pull from in `compose.yml`.

If relevant changes (e.g. a bugfix in FastAPI server or demo page), the image for that component will need to be re-generated and uploaded to Docker Hub with a new tag + latest tag.

Below are instructions on how to build and validate any of these three images.

### `runouns-db` image (Database dump)

#### Build the image locally

1. **Go to `ruslovar-db` repo**

2. Build the image 

```bash
docker build -t ikzv/runouns-db:0.1.0 .
```

- Use an explicit version tag (`0.1.0`) rather than `latest` during development. We’ll tag `latest` only after validation.

#### Validate the Image

##### Start a container

```bash
docker run -d --name runouns-db-test \
  -p 3306:3306 \
  ikzv/runouns-db:0.1.0
```

- `-d` runs the container in the background.
- `--name` gives it a predictable name for later commands.
- `-p 3306:3306` maps the container’s MySQL port to your host.

**If you are already running MySQL locally, it might be using 3306 (default MySQL port). If so, switch to another port to avoid conflict (e.g. `-p 3307:3306`)**

##### Verify the container is running

```bash
docker ps --filter "name=runouns-db-test"
```

Expected output shows status `Up` and port `0.0.0.0:3306->3306/tcp`.

##### Check container logs

MySQL emits a lot of output during first initialization. To tail the logs:

```bash
docker logs -f runouns-db-test
```

Look for lines like:

```
[Entrypoint] MySQL init process done. Ready for start up.
[System] [Server] mysqld: ready for connections.
```

Press `Ctrl+C` to stop following the log stream (the container keeps running).

##### Verify MySQL is responding

```bash
docker exec runouns-db-test mysql --version
```

Expected output:

```
mysql  Ver 8.0.x for Linux on x86_64 (MySQL Community Server - GPL)
```

##### Verify the database and indexes were loaded

Run the same query you use locally, inside the container:

```bash
docker exec runouns-db-test \
  mysql -u root -ppassword runouns -e "SHOW INDEXES FROM nouns_morf;"
```

docker exec ruslovar-db \
  mysql -u root -ppassword runouns -e "SHOW INDEXES FROM nouns_morf;"

Expected output should include the custom indexes:

```bash
mysql: [Warning] Using a password on the command line interface can be insecure.
Table   Non_unique      Key_name        Seq_in_index    Column_name     Collation       Cardinality     Sub_part        Packed  Null    Index_type      Comment Index_comment   Visible Expression
nouns_morf      0       PRIMARY 1       IID     A       767695  NULL    NULL            BTREE                   YES     NULL
nouns_morf      1       code_idx        1       code    A       767695  NULL    NULL            BTREE                   YES     NULL
nouns_morf      1       code_parent_idx 1       code_parent     A       127949  NULL    NULL            BTREE                   YES     NULL
nouns_morf      1       word_idx        1       word    A       47980   5       NULL            BTREE                   YES     NULL

```

**If the table exists and indexes are listed, the init dump was  imported correctly.**

### `ruslovar-api` image (FastAPI server)

#### Build the image locally

1. **Go to ruslovar-api repo**

2. Build the image from **repo root**

```bash
docker build -f docker/api.Dockerfile -t ikzv/ruslovar-api:0.1.0 .
```

#### Validate the image

##### Create a test container using the image, on port 8000

**note**: port mapping in Docker is `<`local port`>`:`<`docker network port`>`, so this will bind to your port 8000. If you're using 8000 for something else change to e.g. 9000:8000

```bash
docker run -d --rm --name ruslovar-api-test -p 8000:8000 ikzv/ruslovar-api:0.1.0
```

##### Verify the sever is running in test container

```bash
docker logs ruslovar-api-test
```

(should see output...)

```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

##### Basic health check on port 8000 (or whichever port you exposed)

```
curl http://127.0.0.1:8000/health
```

output:

```
$ curl http://127.0.0.1:8000/health
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100    15  100    15    0     0     27      0 --:--:-- --:--:-- --:--:--    27{"status":"ok"}
```

##### Ensure you can open Swagger UI on port 8000 (or whichever port you used)

 [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
 
**Note**: Will NOT be able to query db yet (as nothing is hooked up). Just basic sanity test.

### `ruslovar-demo` image (Demo page using nginx)

#### Build image locally

1. **Go to ruslovar-api repo**

2. Build the image from **repo root**

```bash
docker build -f docker/demo.Dockerfile -t ikzv/ruslovar-demo:0.1.0 .
```

2. Create a test container using the image, on port 8080

**note**: port mapping in Docker is `<`local port`>`:`<`docker network port`>`, so this will bind to your port 8080. If you're using 8000 for something else change to e.g. 9080:8080

```bash
docker run -d --rm --name ruslovar-demo-test -p 8080:8080 ikzv/ruslovar-demo:0.1.0
```

3. Visit demo page in browser

Open [http://127.0.0.1:8080](http://127.0.0.1:8080)

## Building everything together with compose yml

This section provides a basic sanity check on the docker project -- e.g. pulling the **existing** latest Docker images from Docker Hub and deploying them.

If you wish to test instead your local images, you can use a modified version of `docker.yml` to point to your local images. The rest of the steps remain unchanged.

1. Navigate to ruslovar-api repo root

2. Build development containers

	```
	docker compose -p testenv up -d
	```

	**This will build both and then detach once complete**. If pulling the db image fresh, could take a while. (5 minutes).

	Upon completion, should have two containers: `testenv-api-1` and `testenv-db-1`

3. **Check both containers are running:**

	```bash
	docker ps
	```

	You should see both `testenv-db-1` and `testenv-api-1` containers with status `Up`.

4. **Check API logs for startup confirmation:**

	```bash
	docker logs testenv-api-1
	```

	You should see uvicorn started on `0.0.0.0:8000`.

5. **Check db container initialized correctly:**

	```bash
	docker logs testenv-db-1
	```

	Look for the import completion message. MySQL should show it processed the `.sql.gz` file.

6. **Test the health endpoint:**

	```bash
	curl http://127.0.0.1:8000/health
	```

7. **Query a noun via Swagger UI:**

	Open [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) and try `/nouns/кролик/declensions`.

	Or via curl:

     ```bash
	curl "http://127.0.0.1:8000/api/v1/nouns/кролик/declensions"
 	```

	You should get the full declension table.

8. **Test a declined form to verify parent resolution:**

	```bash
    curl "http://127.0.0.1:8000/api/v1/nouns/кролика/declensions"
	```

	Should resolve to `кролик`.

9. **Test an invariant:**

	```bash
	curl "http://127.0.0.1:8000/api/v1/nouns/кофе/declensions"
	```

	Should return `invariant: true`.

	**If all these pass, the API and db containers are working correctly together.**

10. Cleanup:

	```bash
	docker compose down
	```

	If you want to wipe the database volume too:

	```bash
	docker compose down -v
	```

## Push updated images to Docker hub

### Log in to Docker

(from dir where your `token.txt` is)

```
cat token.txt | docker login -u ikzv --password-stdin
```

### API image

Confirm the local image you built exists

`docker images ikzv/ruslovar-api`

**Tag the release as latest**

```
docker tag ikzv/ruslovar-api:0.1.0 ikzv/ruslovar-api:latest
```

**Push to Dockerhub**

```
docker push ikzv/ruslovar-api:0.1.0
docker push ikzv/ruslovar-api:latest
```

### Demo image

Confirm the local image you built exists

```
docker images ikzv/ruslovar-demo
```

**Tag the release as latest**

```
docker tag ikzv/ruslovar-demo:0.1.0 ikzv/ruslovar-demo:latest
```

**Push to Dockerhub**

```
docker push ikzv/ruslovar-demo:0.1.0
docker push ikzv/ruslovar-demo:latest
```

## Docker useful

### Nuke

Only nuke stopped containers and images

```
docker system prune -af
```

Nuke everything

```
docker stop $(docker ps -aq); docker rm $(docker ps -aq); docker rmi $(docker images -q); docker system prune -af --volumes
```

### Stop all containers without nuking

```
docker stop $(docker ps -q)
```
