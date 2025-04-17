run-debug:
	flask -e .env --debug run --port 5500

run:
	flask -e .env run --port 5500 --reload
