# School Closing Backend

This is a backend service for fetching and processing school closure data. The service periodically checks for updates and provides an API endpoint to retrieve the latest closure information.

## Features

- Fetches school closure data from a specified URL.
- Processes and matches closure data with a predefined list of schools.
- Provides an API endpoint to retrieve the latest closure information.
- Periodically updates the closure data.

## Installation

1. Clone the repository:
    ```sh
    git clone <repository-url>
    cd school-closing-backend
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

3. Create a `.env` file in the root directory with the following content:
    ```env
    HOST=0.0.0.0
    PORT=0000
    CLOSING_DATA_1=SCHOOL_CLOSING_DATA_SOURCE
    ```

4. Ensure you have the `states/michigan.json` file with the necessary school data.

## Usage

1. Start the server:
    ```sh
    npm start
    ```

2. The server will start listening on the specified host and port. By default, it will be `http://0.0.0.0:3025`.

3. The closure data will be fetched and processed initially, and then periodically updated every 2.5 minutes.

4. Access the API endpoint to retrieve the latest closure information:
    ```sh
    GET /api/closures
    ```

## File Structure

- `server.js`: Main server file that handles fetching and processing closure data, and provides the API endpoint.
- `.env`: Environment variables file to configure the host, port, and data URL.
- `states/michigan.json`: JSON file containing the list of schools to match against the closure data.
- `package.json`: Project configuration and dependencies.

## Dependencies

- `axios`: For making HTTP requests to fetch closure data.
- `cheerio`: For parsing and extracting data from HTML.
- `dotenv`: For loading environment variables from a `.env` file.
- `express`: For creating the server and API endpoint.
- `fuzzball`: For fuzzy string matching to match school names.
- `nodemon`: For automatically restarting the server during development.

## License

This project is licensed under the ISC License.
