import express from "express";
import axios from "axios";
import morgan from "morgan";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.urlencoded({
    extended: true
}));
app.set("view engine", "ejs");
app.use(morgan("dev"));

// Helper function to get opening name from ECO code
function getOpeningName(eco, pgn) {
    
    //Extracting opening name from PGN
    const openingMatch = pgn.match(/\[ECOUrl "https:\/\/www\.chess\.com\/openings\/(.+?)"\]/);
    if (openingMatch) {
        return openingMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return eco || 'Unknown Opening';
}
//to Keep track of users;
let analysisCount = 0;

// Update both routes:
app.get("/", (req, res) => {
    res.render("index.ejs", {
        analysisCount: analysisCount
    });
});

app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// Homepage
app.get("/", (req, res) => {
    res.render("index.ejs");
});

// Analyze games
app.post("/analyze", async (req, res) => {
    const username = req.body.username.toLowerCase();

    try {
        // Step 1: Get list of game archives
        const archivesResponse = await axios.get(
            `https://api.chess.com/pub/player/${username}/games/archives`
        );
        const archives = archivesResponse.data.archives;

        // Step 2: Get the most recent 6 months (more data)
        const recentArchives = archives.slice(-6);

        //if user Has No Games:
        if (archives.length === 0) {
            return res.render("index.ejs", {
                error: "This user has no game history on chess.com"
            });
        }

        let allGames = [];

        for (const archiveUrl of recentArchives) {
            const gamesResponse = await axios.get(archiveUrl);
            allGames = allGames.concat(gamesResponse.data.games);
        }

        // Step 3: Separate games by result and color
        const losses = [];
        const winsAsWhite = [];
        const winsAsBlack = [];

        allGames.forEach(game => {
            const isWhite = game.white.username.toLowerCase() === username;
            const playerColor = isWhite ? 'white' : 'black';
            const result = game[playerColor].result;

            if (result === 'win') {
                if (isWhite) {
                    winsAsWhite.push(game);
                } else {
                    winsAsBlack.push(game);
                }
            } else if (result === 'checkmated' || result === 'resigned' ||
                result === 'timeout' || result === 'abandoned') {
                losses.push(game);
            }
        });

        // Step 4: Analyze LOSSES (openings you struggle against)
        const lossOpenings = {};
        losses.forEach(game => {
            const opening = getOpeningName(game.eco, game.pgn);
            lossOpenings[opening] = (lossOpenings[opening] || 0) + 1;
        });

        // Step 5: Analyze WINS AS WHITE (your successful white openings)
        const whiteWinOpenings = {};
        winsAsWhite.forEach(game => {
            const opening = getOpeningName(game.eco, game.pgn);
            whiteWinOpenings[opening] = (whiteWinOpenings[opening] || 0) + 1;
        });

        // Step 6: Analyze WINS AS BLACK (your successful black openings)
        const blackWinOpenings = {};
        winsAsBlack.forEach(game => {
            const opening = getOpeningName(game.eco, game.pgn);
            blackWinOpenings[opening] = (blackWinOpenings[opening] || 0) + 1;
        });

        // Step 7: Sort all categories
        const topLosses = Object.entries(lossOpenings)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topWhiteWins = Object.entries(whiteWinOpenings)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topBlackWins = Object.entries(blackWinOpenings)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Step 8: Calculate stats
        const totalWins = winsAsWhite.length + winsAsBlack.length;
        const winRate = ((totalWins / allGames.length) * 100).toFixed(1);

        // Step 9: Render results
        res.render("results.ejs", {
            username: username,
            totalGames: allGames.length,
            totalWins: totalWins,
            totalLosses: losses.length,
            winRate: winRate,
            winsAsWhite: winsAsWhite.length,
            winsAsBlack: winsAsBlack.length,
            topLosses: topLosses,
            topWhiteWins: topWhiteWins,
            topBlackWins: topBlackWins
        });

    } catch (error) {
        console.error("Error:", error.message);
        res.render("index.ejs", {
            error: "Could not fetch data. Check username or try again."
        });
    }
});


let totalVisits = 0;
let uniqueVisitors = new Set();


app.get("/", (req, res) => {
    totalVisits++;
    uniqueVisitors.add(req.ip);

    res.render("index.ejs", {
        totalVisits: totalVisits,
        uniqueVisitors: uniqueVisitors.size
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});