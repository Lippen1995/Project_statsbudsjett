.PHONY: etl dev build test install clean

install:
	pip install -r etl/requirements.txt
	cd web && npm install

etl:
	python etl/etl.py

etl-force:
	python etl/etl.py --force

etl-inspect:
	python etl/etl.py --inspect

test:
	python -m pytest etl/tests/ -v

dev:
	cd web && npm run dev

build:
	cd web && npm run build

clean:
	rm -rf etl/raw/ web/public/data/ web/dist/
	find . -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true
