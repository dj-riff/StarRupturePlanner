# Star Rupture Production Planner

A production chain calculator for the game Star Rupture, helping players optimize their factory setups.

## AI-Generated
This repository is more of an experiment to see what AI can do. There is 0 human code here, it's entirely built by AI.

## 🌐 Web Version

**Try it now:** [https://dj-riff.github.io/StarRupturePlanner/](https://dj-riff.github.io/StarRupturePlanner/)

The planner runs directly in your web browser - no installation required!

## 🖥️ Desktop Version (Electron)

If you prefer a standalone desktop application:

### Prerequisites
- Node.js (v14 or higher)

### Installation
```bash
npm install
```

### Running the Desktop App
```bash
npm start
```

## Features

- **Production Chain Planning**: Calculate exact machine counts needed for your desired output
- **Multiple Targets**: Plan multiple production chains simultaneously with tabs
- **External Supply**: Account for resources you're importing from elsewhere
- **Auto-scaling**: Automatically balance machine ratios for optimal efficiency
- **Interactive Visualization**: Drag nodes to rearrange your production graph
- **Pan & Zoom**: Navigate large production chains easily

## Usage

1. Type a recipe name in the "Target Recipes" input field
2. Set your desired output rate (per minute)
3. Optionally add external resource supplies
4. Click "Compute" to generate your production chain
5. View machine counts, utilization, and the full dependency graph

## Data Format

The recipe data is embedded in `renderer.js` as tab-separated values. Each recipe includes:
- Machine type
- Recipe name
- Processing time
- Output per cycle
- Input resources and amounts

## Development

The application consists of:
- `index.html` - Main UI structure
- `renderer.js` - Application logic and recipe data
- `styles.css` - Dark-themed styling
- `main.js` - Electron wrapper (desktop version only)

## Deployment

The web version is automatically deployed to GitHub Pages via GitHub Actions when changes are pushed to the main branch.

## License

See LICENSE file for details.
