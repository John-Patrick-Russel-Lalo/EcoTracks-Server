const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;

// Memory storage for trash bins
// Now includes status property: 'empty', 'half', or 'full'
const trashBins = new Map(); // Key: id, Value: { id, latitude, longitude, status }

let nextBinId = 1;

// Serve static files
app.use(express.static('public'));

// Basic route for the homepage
app.get('/', (req, res) => {
  res.send('EcoTrack Server is running');
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send all existing bins to the new client
  for (const bin of trashBins.values()) {
    ws.send(JSON.stringify({ type: 'trashbin', ...bin }));
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);

      if (data.type === 'trashbin') {
        // Add a new trash bin
        const id = nextBinId++;
        // Default status is 'empty' for new bins
        const newBin = { 
          type: 'trashbin', 
          id, 
          latitude: data.latitude, 
          longitude: data.longitude,
          status: 'empty' // Default status
        };
        trashBins.set(id, newBin);

        // Broadcast to all clients
        broadcast(JSON.stringify(newBin));
        console.log(`New bin added with ID: ${id}`);
      }

      else if (data.type === 'deletebin') {
        // Delete a trash bin
        const id = parseInt(data.id);
        if (trashBins.has(id)) {
          trashBins.delete(id);
          broadcast(JSON.stringify({ type: 'deletebin', id }));
          console.log(`Bin deleted with ID: ${id}`);
        }
      }

      else if (data.type === 'editbin') {
        // Edit bin location
        for (const [id, bin] of trashBins) {
          if (
            bin.latitude === data.oldLatitude &&
            bin.longitude === data.oldLongitude
          ) {
            bin.latitude = data.newLatitude;
            bin.longitude = data.newLongitude;
            broadcast(JSON.stringify({ type: 'editbin', id, ...bin }));
            console.log(`Bin edited with ID: ${id}`);
            break;
          }
        }
      }

      else if (data.type === 'updatebinstatus') {
        // Update bin status (new feature)
        const id = parseInt(data.id);
        if (trashBins.has(id)) {
          const bin = trashBins.get(id);
          
          // Validate status value
          const validStatuses = ['empty', 'half', 'full'];
          if (!validStatuses.includes(data.status)) {
            console.error(`Invalid status: ${data.status}`);
            return;
          }
          
          // Update the bin status
          bin.status = data.status;
          
          // Broadcast the status update to all clients
          broadcast(JSON.stringify({ 
            type: 'binstatus', 
            id, 
            status: data.status,
            latitude: bin.latitude,
            longitude: bin.longitude
          }));
          
          console.log(`Bin ${id} status updated to: ${data.status}`);
        } else {
          console.error(`Bin with ID ${id} not found`);
        }
      }

      else if (data.type === 'location') {
        // Optionally log or use user location
        console.log('User location:', data.latitude, data.longitude);
      }
      
      else {
        console.log(`Unknown message type: ${data.type}`);
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Broadcast message to all connected clients
function broadcast(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// Get all bins (could be used for a REST API endpoint)
app.get('/api/bins', (req, res) => {
  const binsArray = Array.from(trashBins.values());
  res.json(binsArray);
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server is running`);
});

// Handle server shutdown gracefully
process.on('SIGINT', () => {
  console.log('Server shutting down');
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
});