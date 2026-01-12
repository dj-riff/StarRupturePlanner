// Renderer script for Factory Chain Calculator

// Embedded recipe data (tab‑separated).  See README for format.
const recipeData = `Machine	Recipe	Processing Time	Out	Per Minute	Resource 1	Amount	Resource 2	Amount	Resource 3	Amount
Ore Extractor	Wolfram Ore (Impure)	2	2	60	N/A				
Ore Extractor	Titanium Ore (Impure)	2	2	60	N/A				
Ore Extractor	Titanium Ore (Normal)	2	4	120	N/A				
Helium Extractor	Helium-3	2	8	240	N/A				
Smelter	Titanium Bar	2	2	60	Titanium Ore				
Smelter	Wolfram Bar	2	2	60	Wolfram Ore				
Smelter	Calcium Block	2	2	60	Calcium Ore				
Fabricator	Basic Building Material	2	10	300	Titanium Ore	1	Wolfram Ore	1		
Fabricator	Pistol Ammo	2	10	300	Basic Building Material	14			
Fabricator	Titanium Rod	2	1	30	Titanium Bar	1			
Fabricator	Titanium Sheet	2	2	60	Titanium Bar	1			
Fabricator	Titanium Beam	3	1	20	Titanium Bar	1			
Fabricator	Wolfram Wire	4	2	30	Wolfram Bar	1			
Fabricator	Wolfram Plate	1	1	60	Wolfram Bar	1			
Fabricator	Rotor	6	1	10	Titanium Rod	2	Wolfram Wire	2		
Fabricator	Tube	2	2	60	Titanium Rod	1	Titanium Sheet	1		
Fabricator	Calcite Sheets	2	2	60	Calcium Block	1			
Fabricator	Stabilizer	6	1	10	Rotor	1	Titanium Rod	2		
Fabricator	Stator	3	1	20	Titanium Housing	2	Wolfram Wire	1		
Fabricator	Applicator	4	1	15	Tube	8	Glass	2		
Furnace	Wolfram Powder	2	3	90	Wolfram Bar	1			
Furnace	Calcium Powder	3	3	60	Calcium Block	1			
Furnace	Titanium Housing	2	1	30	Titanium Beam	1	Titanium Sheet	2		
Furnace	Ceramics	2	2	60	Calcite Sheets	1	Wolfram Powder	1		
Furnace	Glass	3	1	20	Helium-3	1	Calcium Powder	2		
Furnace	Inductor	3	1	20	Tube	2	Wolfram Wire	1	Ceramics	2
Furnace	Heat Resistant Sheet	4	1	15	Wolfram Plate	1	Titanium Sheet	2	Glass	1
Furnace	Synthetic Silicon	2	2	60	Calcium Powder	2	Helium-3	1	Cermaics	2
Furnace	Electronics	5	1	12	Synthetic Silicon	2	Inductor	1	Stator	1
Furnace	Chemicals	2	2	60	Synthetic Silicon	1	Wolfram Powder	3	Helium-3	1
Furnace	Hardening Agent	4	2	30	Sulfuric Acid	2	Synthetic Silicon	1	Applicator	1
Furnace	Super Magnet	3	1	20	Sulfuric Acid	5	Wolfram Plate	5	Chemicals	2
`;

// Parse TSV data into recipe objects
function parseRecipes(tsv) {
  const lines = tsv.trim().split(/\r?\n/);
  // skip header
  const recipes = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    if (!cells[1] || !cells[1].trim()) continue;
    const machine = cells[0].trim();
    const name = cells[1].trim();
    const processingTime = parseFloat(cells[2]);
    const outputPerCycle = parseFloat(cells[3]);
    const inputs = [];
    // Parse up to three input pairs (starting at index 5)
    for (let j = 5; j < cells.length; j += 2) {
      const res = cells[j] ? cells[j].trim() : '';
      if (!res || res.toUpperCase() === 'N/A') continue;
      const amtStr = cells[j + 1] ? cells[j + 1].trim() : '';
      // If the amount string is empty, assume a default of 1.  Some
      // recipe entries omit the amount column but imply one unit of
      // input per cycle.  Otherwise parse the numeric value.
      const amt = amtStr ? parseFloat(amtStr) : 1;
      inputs.push({ resource: res, amount: amt });
    }
    recipes[name] = { machine, name, processingTime, outputPerCycle, inputs };
  }
  return recipes;
}

// Recipe book loaded from embedded data or file
let recipeBook = parseRecipes(recipeData);

// Utility functions for GCD and LCM
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
function lcm(a, b) {
  return (a / gcd(a, b)) * b;
}

// Compute output per minute for a recipe
function outputPerMinute(recipe) {
  return recipe.outputPerCycle * (60 / recipe.processingTime);
}


// Mode B calculation
function computeModeB(recipeName, finalMachineCount, autoScale, externalSupply, supplyUsed) {
  const recipe = recipeBook[recipeName];
  if (!recipe) throw new Error('Unknown recipe ' + recipeName);
  if (finalMachineCount <= 0) throw new Error('Final machine count must be positive');
  let scaledFinal = finalMachineCount;
  if (autoScale) {
    // compute denominators for immediate inputs
    const denominators = [];
    for (const input of recipe.inputs) {
      const upstream = recipeBook[input.resource];
      if (!upstream) continue;
      // numerator = final * amount * processing_time_upstream
      const numerator = scaledFinal * input.amount * upstream.processingTime;
      // denom = processing_time_current * output_per_cycle_upstream
      const denom = recipe.processingTime * upstream.outputPerCycle;
      const g = gcd(numerator, denom);
      const reducedDenom = denom / g;
      if (reducedDenom !== 1) denominators.push(reducedDenom);
    }
    if (denominators.length > 0) {
      let scale = 1;
      for (const d of denominators) {
        scale = lcm(scale, d);
      }
      scaledFinal *= scale;
    }
  }
  const root = buildNodeB(recipe, scaledFinal, [], externalSupply || {}, supplyUsed || {});
  return { root, scaledFinal };
}

function buildNodeB(recipe, machineCount, path, externalSupply, supplyUsed) {
  if (path.includes(recipe.name)) {
    throw new Error('Cyclic dependency detected: ' + [...path, recipe.name].join(' → '));
  }
  const outPerMin = outputPerMinute(recipe) * machineCount;
  const children = [];
  for (const input of recipe.inputs) {
    const cyclesPerMin = 60 / recipe.processingTime;
    const requiredInputPerMinTotal = machineCount * input.amount * cyclesPerMin;
    const supplyCap = (externalSupply && externalSupply[input.resource]) ? externalSupply[input.resource] : 0;
    const usedSoFar = (supplyUsed && supplyUsed[input.resource]) ? supplyUsed[input.resource] : 0;
    const remaining = Math.max(0, supplyCap - usedSoFar);
    const suppliedNow = Math.min(requiredInputPerMinTotal, remaining);
    if (suppliedNow > 0) supplyUsed[input.resource] = usedSoFar + suppliedNow;
    const requiredInputPerMin = Math.max(0, requiredInputPerMinTotal - suppliedNow);
    const upstream = recipeBook[input.resource];
    if (!upstream) {
      children.push({
        recipeName: input.resource,
        machineName: 'Raw',
        exactMachines: 0,
        wholeMachines: 0,
        utilisation: 1,
        requiredOutputPerMin: requiredInputPerMinTotal,
        actualOutputPerMin: requiredInputPerMinTotal,
        cls: 'raw'
      });
      continue;
    }
    if (requiredInputPerMin <= 0) {
      children.push({
        recipeName: input.resource,
        machineName: 'External',
        exactMachines: 0,
        wholeMachines: 0,
        utilisation: 1,
        requiredOutputPerMin: requiredInputPerMinTotal,
        actualOutputPerMin: requiredInputPerMinTotal,
        suppliedPerMin: suppliedNow,
        cls: 'supply'
      });
      continue;
    }
    if (!upstream) {
      children.push({
        recipeName: input.resource,
        machineName: 'Raw',
        exactMachines: 0,
        wholeMachines: 0,
        utilisation: 0,
        requiredOutputPerMin: requiredInputPerMinTotal,
        suppliedPerMin: suppliedNow,
        requiredFromProductionPerMin: requiredInputPerMin,
        actualOutputPerMin: requiredInputPerMinTotal,
        overproductionPerMin: 0,
        inputs: []
      });
    } else {
      const upstreamOutPerMin = outputPerMinute(upstream);
      if (upstreamOutPerMin === 0) throw new Error('Recipe ' + upstream.name + ' produces no output');
      const exactNeeded = requiredInputPerMin / upstreamOutPerMin;
      const wholeNeeded = Math.ceil(exactNeeded);
      const actualOutput = wholeNeeded * upstreamOutPerMin;
      const overProd = actualOutput - requiredInputPerMin;
      const child = buildNodeB(upstream, wholeNeeded, path.concat(recipe.name), externalSupply, supplyUsed);
      // override properties reflecting this branch
      child.exactMachines = exactNeeded;
      child.wholeMachines = wholeNeeded;
      child.utilisation = wholeNeeded > 0 ? exactNeeded / wholeNeeded : 0;
      child.requiredOutputPerMin = requiredInputPerMinTotal;
      child.suppliedPerMin = suppliedNow;
      child.requiredFromProductionPerMin = requiredInputPerMin;
      child.actualOutputPerMin = actualOutput;
      child.overproductionPerMin = overProd;
      children.push(child);
    }
  }
  return {
    recipeName: recipe.name,
    suppliedPerMin: 0,
    requiredFromProductionPerMin: outPerMin,
    machineName: recipe.machine,
    exactMachines: machineCount,
    wholeMachines: machineCount,
    utilisation: machineCount > 0 ? 1 : 0,
    requiredOutputPerMin: outPerMin,
    actualOutputPerMin: outPerMin,
    overproductionPerMin: 0,
    inputs: children
  };
}

// Summarise total machines by type
function summariseMachines(node, totals = {}) {
  if (node.machineName && node.machineName !== 'Raw' && node.machineName !== 'Excess') {
    // Use the whole machine count (integer machines) instead of exact
    totals[node.machineName] = (totals[node.machineName] || 0) + node.wholeMachines;
  }
  if (node.inputs && Array.isArray(node.inputs)) {
    for (const child of node.inputs) {
      summariseMachines(child, totals);
    }
  }
  return totals;
}

/**
 * Compute the maximum depth of a production chain tree.  Depth is
 * measured in terms of non‑excess nodes; excess nodes are not
 * considered when determining depth because they are positioned
 * separately.  The root node is at depth 0.  Children of the root
 * contribute depth + 1, and so on.
 *
 * @param {Object} node The root of the tree.
 * @returns {number} Maximum depth among non‑excess nodes.
 */
function getMaxDepth(node) {
  let maxDepth = 0;
  function dfs(n, depth) {
    if (!n || !n.inputs) return;
    for (const child of n.inputs) {
      // Skip excess nodes when calculating depth
      if (child.machineName === 'Excess') continue;
      const childDepth = depth + 1;
      if (childDepth > maxDepth) maxDepth = childDepth;
      dfs(child, childDepth);
    }
  }
  dfs(node, 0);
  return maxDepth;
}

/**
 * Resolve overlapping nodes by adjusting their vertical positions.
 * Nodes at the same depth (x-coordinate) that would overlap are
 * repositioned vertically while maintaining their horizontal alignment.
 *
 * @param {Array} layoutNodes Array of nodes with x, y coordinates
 */
function resolveNodeOverlaps(layoutNodes) {
  // Group nodes by their x-coordinate (depth column)
  const nodesByX = {};
  layoutNodes.forEach(node => {
    if (!nodesByX[node.x]) nodesByX[node.x] = [];
    nodesByX[node.x].push(node);
  });
  // For each column, sort by y and resolve overlaps
  Object.keys(nodesByX).forEach(xCoord => {
    const nodesInColumn = nodesByX[xCoord];
    // Sort by current y position
    nodesInColumn.sort((a, b) => a.y - b.y);
    // Adjust positions to prevent overlap, maintaining minimum spacing
    for (let i = 1; i < nodesInColumn.length; i++) {
      const prevNode = nodesInColumn[i - 1];
      const currNode = nodesInColumn[i];
      const minY = prevNode.y + GRAPH_NODE_HEIGHT + GRAPH_V_SPACING;
      if (currNode.y < minY) {
        currNode.y = minY;
      }
    }
  });
}

/**
 * Merge multiple production chains into a single aggregated graph.
 * Duplicate recipes and resources across different target chains are
 * merged into a single node whose required and actual outputs are
 * summed.  Excess nodes are not merged; they are treated as unique
 * children of their parent.  The resulting graph is a directed
 * acyclic graph where edges represent consumption relationships
 * between aggregated nodes.
 *
 * @param {Array} results Array of computation results from computeModeB
 * @param {Array} targetOrder Array of selected target names in the
 *        order they were specified.  This determines the vertical
 *        ordering of final products (row indices).
 * @returns {Object} A layout object with nodes and edges ready for
 *          rendering via renderGraphPanZoom.
 */
function mergeResults(results, targetOrder) {
  // Maps to hold aggregated nodes and edges
  const nodeMap = new Map(); // key -> aggregated node
  const parentsMap = {}; // childKey -> Set of parentKeys
  const childrenMap = {}; // parentKey -> Map of childKey -> aggregatedRate

  // Helper to get a unique key for a node
  function getKey(node) {
    return `${node.machineName}|${node.recipeName}`;
  }

  // Traverse a tree to aggregate nodes and edges
  function traverse(node, parentKey) {
    const key = getKey(node);
    let agg = nodeMap.get(key);
    if (!agg) {
      agg = {
        key,
        recipeName: node.recipeName,
        machineName: node.machineName,
        exactMachines: 0,
        wholeMachines: 0,
        requiredOutputPerMin: 0,
        actualOutputPerMin: 0,
        overproductionPerMin: 0,
      };
      nodeMap.set(key, agg);
    }
    // Aggregate numeric attributes.  For excess and raw nodes,
    // machine counts remain zero.
    agg.exactMachines += node.exactMachines;
    agg.wholeMachines += node.wholeMachines;
    agg.requiredOutputPerMin += node.requiredOutputPerMin;
    agg.actualOutputPerMin += node.actualOutputPerMin;
    agg.overproductionPerMin += node.overproductionPerMin;

    // Create edge from child to parent (consumption) if parent exists
    if (parentKey) {
      // Register child->parent relationship
      if (!parentsMap[key]) parentsMap[key] = new Set();
      parentsMap[key].add(parentKey);
      if (!childrenMap[parentKey]) childrenMap[parentKey] = new Map();
      // Sum required output for this edge
      const prev = childrenMap[parentKey].get(key) || 0;
      childrenMap[parentKey].set(key, prev + node.requiredOutputPerMin);
    }
    // Recursively process inputs
    if (node.inputs && node.inputs.length > 0) {
      node.inputs.forEach(child => {
        // Do not merge excess nodes across different parents
        traverse(child, key);
      });
    }
  }
  // Aggregate all result trees
  results.forEach(res => {
    // Deep copy with excess nodes inserted, skipping root excess
    const tree = insertExcessNodes(res.root, true);
    traverse(tree, null);
  });
  // Compute root nodes (final products): nodes with no parents
  const rootKeys = [];
  nodeMap.forEach((value, key) => {
    if (!parentsMap[key] || parentsMap[key].size === 0) {
      // Exclude excess nodes as roots
      if (value.machineName !== 'Excess') {
        rootKeys.push(key);
      }
    }
  });
  // Map each root to a row index based on the target order.  If
  // multiple targets produce the same recipe, the first occurrence
  // determines the row; remaining duplicates are placed on the next
  // available row.
  const rootIndexMap = {};
  let nextRootRow = 0;
  targetOrder.forEach((name) => {
    // Find aggregated node key(s) matching this recipe name
    const matching = rootKeys.filter(k => nodeMap.get(k).recipeName === name);
    matching.forEach((k) => {
      if (rootIndexMap[k] === undefined) {
        rootIndexMap[k] = nextRootRow++;
      }
    });
  });
  // Any remaining roots that did not match a target name (unlikely)
  rootKeys.forEach(k => {
    if (rootIndexMap[k] === undefined) {
      rootIndexMap[k] = nextRootRow++;
    }
  });
  // Compute depth for each node.  Depth is the maximum number of
  // consumption steps from a root.  A root has depth 0; its
  // children have depth 1, etc.  Use memoization to avoid
  // recomputation.  Excess nodes are treated as children but their
  // depths are computed normally.
  const depthMap = {};
  function computeDepth(key) {
    if (depthMap[key] !== undefined) return depthMap[key];
    // If node has no parents, depth = 0
    const parents = parentsMap[key];
    if (!parents || parents.size === 0) {
      depthMap[key] = 0;
    } else {
      let maxParentDepth = 0;
      parents.forEach(parentKey => {
        const pd = computeDepth(parentKey);
        if (pd + 1 > maxParentDepth) maxParentDepth = pd + 1;
      });
      depthMap[key] = maxParentDepth;
    }
    return depthMap[key];
  }
  nodeMap.forEach((node, key) => {
    computeDepth(key);
  });
  // Determine maximum depth across all nodes
  let globalMaxDepth = 0;
  Object.values(depthMap).forEach(d => {
    if (d > globalMaxDepth) globalMaxDepth = d;
  });
  // Compute row indices for each node.  The row index of a node is
  // the average of its parents' row indices (or a root row index for
  // final products).  Use memoization to avoid cycles.
  const rowIndexMap = {};
  function computeRowIndex(key) {
    if (rowIndexMap[key] !== undefined) return rowIndexMap[key];
    if (depthMap[key] === 0) {
      // Root node
      rowIndexMap[key] = rootIndexMap[key] !== undefined ? rootIndexMap[key] : nextRootRow++;
    } else {
      const parents = parentsMap[key];
      if (!parents || parents.size === 0) {
        // Should not happen, but treat as new root
        rowIndexMap[key] = nextRootRow++;
      } else {
        let sum = 0;
        let count = 0;
        parents.forEach(parentKey => {
          sum += computeRowIndex(parentKey);
          count += 1;
        });
        rowIndexMap[key] = count > 0 ? sum / count : nextRootRow++;
      }
    }
    return rowIndexMap[key];
  }
  nodeMap.forEach((node, key) => {
    computeRowIndex(key);
  });
  // Normalize row indices to consecutive integers in ascending order
  // based on the averaged row values.  Nodes with the same averaged
  // row value share the same vertical position.  This preserves
  // relative ordering while keeping the graph compact horizontally.
  const uniqueRowValues = Array.from(new Set(Object.values(rowIndexMap))).sort((a, b) => a - b);
  const rowValueToIndex = {};
  uniqueRowValues.forEach((val, idx) => {
    rowValueToIndex[val] = idx;
  });
  // Assign final positions for each aggregated node.  Deeper nodes
  // shift left, and row positions are determined by the mapping
  // defined above.  Utilisation is formatted as a string.
  const layoutNodes = [];
  nodeMap.forEach((node, key) => {
    const depth = depthMap[key];
    const rowVal = rowIndexMap[key];
    const row = rowValueToIndex[rowVal];
    const x = (globalMaxDepth - depth) * (GRAPH_NODE_WIDTH + GRAPH_H_SPACING);
    const y = row * (GRAPH_NODE_HEIGHT + GRAPH_V_SPACING);
    let utilPct = '–';
    if (node.wholeMachines > 0) {
      const utilVal = node.exactMachines / node.wholeMachines;
      utilPct = (utilVal * 100).toFixed(1) + '%';
    }
    layoutNodes.push({
      id: key,
      recipeName: node.recipeName,
      machineName: node.machineName,
      exactMachines: node.exactMachines,
      wholeMachines: node.wholeMachines,
      utilisation: utilPct,
      requiredOutputPerMin: node.requiredOutputPerMin,
      actualOutputPerMin: node.actualOutputPerMin,
      overproductionPerMin: node.overproductionPerMin,
      cls: node.machineName === 'Excess' ? 'excess' : (node.machineName === 'Raw' ? 'raw' : (depth === 0 ? 'final' : 'machine')),
      x,
      y
    });
  });
  // Detect and resolve overlapping nodes at the same depth
  resolveNodeOverlaps(layoutNodes);
  // Build edges for aggregated graph.  We create a new list of edge
  // objects with coordinates and labels based on aggregated rates.
  const edges = [];
  Object.keys(childrenMap).forEach(parentKey => {
    const parent = layoutNodes.find(n => n.id === parentKey);
    childrenMap[parentKey].forEach((rate, childKey) => {
      const child = layoutNodes.find(n => n.id === childKey);
      if (!parent || !child) return;
      let startX, startY, endX, endY, label, midX, midY, excess;
      if (child.machineName === 'Excess') {
        // Excess edge flows from parent to child
        startX = parent.x;
        startY = parent.y + GRAPH_NODE_HEIGHT / 2;
        endX = child.x + GRAPH_NODE_WIDTH;
        endY = child.y + GRAPH_NODE_HEIGHT / 2;
        label = `Excess ${child.recipeName} ${rate.toFixed(2)}/min`;
        excess = true;
      } else {
        // Normal edge flows from child to parent
        startX = child.x + GRAPH_NODE_WIDTH;
        startY = child.y + GRAPH_NODE_HEIGHT / 2;
        endX = parent.x;
        endY = parent.y + GRAPH_NODE_HEIGHT / 2;
        label = `${child.recipeName} ${rate.toFixed(2)}/min`;
        excess = false;
      }
      midX = (startX + endX) / 2;
      midY = (startY + endY) / 2 - 5;
      edges.push({
        fromId: parentKey,
        toId: childKey,
        startX,
        startY,
        endX,
        endY,
        label,
        midX,
        midY,
        excess
      });
    });
  });
  // Reposition excess nodes relative to their parent nodes.  For
  // aggregated graph, we reposition each excess child to the bottom
  // right of its parent.  This is done after initial positioning
  // and before computing the final width/height.  We also adjust
  // edges accordingly.
  layoutNodes.forEach(node => {
    if (node.machineName !== 'Excess') return;
    // Each excess node has exactly one parent in this aggregated
    // graph (childrenMap entries for parent).  Find the parent key.
    let parentKey = null;
    Object.keys(childrenMap).forEach(pk => {
      if (childrenMap[pk].has(node.id)) {
        parentKey = pk;
      }
    });
    if (!parentKey) return;
    const parent = layoutNodes.find(n => n.id === parentKey);
    if (!parent) return;
    // Compute offset: half node width to the right and one node down
    const offsetX = GRAPH_NODE_WIDTH * 0.5;
    const offsetY = GRAPH_NODE_HEIGHT + GRAPH_V_SPACING / 2;
    node.x = parent.x + offsetX;
    node.y = parent.y + offsetY;
    // Update edges pointing to/from this node
    edges.forEach(edge => {
      if (edge.toId === node.id || edge.fromId === node.id) {
        const parentPos = parent;
        const childPos = node;
        let startX, startY, endX, endY;
        if (edge.excess) {
          // Parent to excess child
          startX = parent.x;
          startY = parent.y + GRAPH_NODE_HEIGHT / 2;
          endX = node.x + GRAPH_NODE_WIDTH;
          endY = node.y + GRAPH_NODE_HEIGHT / 2;
        } else {
          // Should not happen for excess nodes, but handle
          startX = node.x + GRAPH_NODE_WIDTH;
          startY = node.y + GRAPH_NODE_HEIGHT / 2;
          endX = parent.x;
          endY = parent.y + GRAPH_NODE_HEIGHT / 2;
        }
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - 5;
        edge.startX = startX;
        edge.startY = startY;
        edge.endX = endX;
        edge.endY = endY;
        edge.midX = midX;
        edge.midY = midY;
      }
    });
  });
  // Determine final width and height based on node positions
  let maxX = 0;
  let maxY = 0;
  layoutNodes.forEach(n => {
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  });
  const width = maxX + GRAPH_NODE_WIDTH;
  const height = maxY + GRAPH_NODE_HEIGHT;
  return { width, height, nodes: layoutNodes, edges };
}

// ------------------- UI and graph rendering logic -------------------
// Constants for node dimensions and spacing in the graph.
// Tune horizontal and vertical spacing to achieve a compact
// horizontal layout similar to the reference image.  Nodes will be
// aligned left‑to‑right with moderate vertical spacing so that
// branching paths remain readable without spreading too far apart.
const GRAPH_NODE_WIDTH = 200;
const GRAPH_NODE_HEIGHT = 80;
const GRAPH_H_SPACING = 180;
const GRAPH_V_SPACING = 60;
// Padding around the graph canvas to prevent edge clipping when nodes
// are dragged to boundaries. This ensures arrows and labels remain visible.
const GRAPH_CANVAS_PADDING = 100;

// Grab references to DOM elements used in the dark themed interface
const recipeDatalist = document.getElementById('recipe-datalist');
const targetInput = document.getElementById('target-input');
const selectedTargetsEl = document.getElementById('selected-targets');
const supplyListEl = document.getElementById('supply-list');
const supplyInputEl = document.getElementById('supply-input');
const supplyRateEl = document.getElementById('supply-rate');
const addSupplyBtnEl = document.getElementById('add-supply-btn');
const supplyAutoscaleEl = document.getElementById('supply-autoscale');
const byproductsListEl = document.getElementById('byproducts-list');
const byproductsSuggestionsEl = document.getElementById('byproducts-suggestions');
const clearTargetsBtn = document.getElementById('clear-targets-btn');
const computeBtn = document.getElementById('compute-btn');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');
// The tab bar at the top of the production chain view
const tabBarEl = document.getElementById('tab-bar');
// An array to store information about open tabs (each computation)
const tabs = [];
// Id of the currently active tab
let activeTabId = null;

/**
 * Retrieve the currently active tab object.  Returns null if no
 * active tab exists.  Each tab stores its own selectedTargets
 * array, summary string and layout.
 */
function getActiveTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

// State: list of selected target recipes.  Each entry has `name` and
// `rate`, where `rate` is the desired output per minute for that
// recipe.  When a new target is added, its default rate is the
// output per minute of one machine.  Users can edit the rate via
// the UI.
// Note: Selected targets are now stored per tab.  See getActiveTab().
// Each tab's selectedTargets array holds objects with `name` and `rate`.

/**
 * Insert excess nodes into a computation tree.  When a machine produces
 * more than the required amount, the overproduction is represented as
 * a child node with machineName "Excess".  The excess node has the
 * same recipe name and carries the amount of overproduction as its
 * requiredOutputPerMin.  This function returns a deep copy of the
 * original node with any excess nodes inserted.
 */
function insertExcessNodes(node, isRoot = false) {
  // Copy the node shallowly and recursively process children
  const newInputs = [];
  if (node.inputs && node.inputs.length > 0) {
    node.inputs.forEach(child => {
      newInputs.push(insertExcessNodes(child, false));
    });
  }
  const copy = {
    recipeName: node.recipeName,
    machineName: node.machineName,
    exactMachines: node.exactMachines,
    wholeMachines: node.wholeMachines,
    utilisation: node.utilisation,
    requiredOutputPerMin: node.requiredOutputPerMin,
    actualOutputPerMin: node.actualOutputPerMin,
    overproductionPerMin: node.overproductionPerMin,
    inputs: newInputs
  };
  // If there is overproduction and this is not the root node, create an excess child node.
  if (!isRoot && node.overproductionPerMin && node.overproductionPerMin > 0.0001) {
    const excessNode = {
      recipeName: node.recipeName,
      machineName: 'Excess',
      exactMachines: 0,
      wholeMachines: 0,
      utilisation: 0,
      requiredOutputPerMin: node.overproductionPerMin,
      actualOutputPerMin: node.overproductionPerMin,
      overproductionPerMin: 0,
      inputs: []
    };
    newInputs.push(excessNode);
  }
  return copy;
}

/**
 * Compute a horizontal layout for a production chain.  Returns an
 * object containing positioned nodes and edges.  Each node has x,y
 * coordinates and a class (raw, machine, final, excess) used for
 * styling.  Each edge contains coordinates and a label as well as a
 * flag indicating whether it represents excess output.
 * The layout is constructed so that raw resources appear on the left
 * and the final product appears on the right.
 *
 * @param {Object} root The root of the production chain tree.
 * @returns {{width:number,height:number,nodes:Array,edges:Array}}
 */
function layoutGraph(root, overrideMaxDepth) {
  // Collect nodes by depth.  Depth is determined by non‑excess nodes.
  const levels = {};
  const nodes = [];
  const nodeIds = new Map();
  let idCounter = 0;
  function collect(n, depth) {
    const id = 'n' + (idCounter++);
    nodeIds.set(n, id);
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(n);
    nodes.push(n);
    if (n.inputs && n.inputs.length > 0) {
      n.inputs.forEach(child => {
        // Only increase depth for non‑excess children; excess nodes will be
        // positioned separately after initial layout
        const nextDepth = child.machineName === 'Excess' ? depth : depth + 1;
        collect(child, nextDepth);
      });
    }
  }
  collect(root, 0);
  const depths = Object.keys(levels).map(d => parseInt(d, 10));
  // Local maximum depth from this tree
  const localMax = depths.length > 0 ? Math.max(...depths) : 0;
  // Determine the maximum depth to use for positioning.  If an
  // override value is provided (from global max across multiple
  // targets), use that; otherwise use the local maximum.
  const maxDepth = overrideMaxDepth !== undefined ? overrideMaxDepth : localMax;
  // Compute row counts for each depth to determine height
  const maxRows = depths.reduce((acc, d) => Math.max(acc, levels[d].length), 1);
  // Assign initial positions for each node.  Deeper nodes (greater
  // depth) appear on the left.  We invert depth relative to
  // maxDepth so that raw resources align on the left and final
  // products align on the right.
  const positions = {};
  depths.forEach(d => {
    const column = levels[d];
    column.forEach((node, rowIndex) => {
      const x = (maxDepth - d) * (GRAPH_NODE_WIDTH + GRAPH_H_SPACING);
      const y = rowIndex * (GRAPH_NODE_HEIGHT + GRAPH_V_SPACING);
      positions[nodeIds.get(node)] = { x, y, nodeRef: node };
    });
  });
  // Reposition excess nodes to the bottom right of their parent.  This
  // takes place after initial positioning so that their placement
  // doesn’t influence the alignment of the main chain.
  nodes.forEach(parent => {
    if (!parent.inputs || parent.inputs.length === 0) return;
    // Find all excess children of this parent
    const excessChildren = parent.inputs.filter(ch => ch.machineName === 'Excess');
    if (excessChildren.length === 0) return;
    const parentId = nodeIds.get(parent);
    const parentPos = positions[parentId];
    excessChildren.forEach((child, idx) => {
      const childId = nodeIds.get(child);
      // Position the excess child to the bottom right of the parent
      // with a small offset.  If multiple excess children exist, stack
      // them vertically below each other.
      const offsetX = GRAPH_NODE_WIDTH * 0.5;
      const offsetY = (GRAPH_NODE_HEIGHT + GRAPH_V_SPACING) * (idx + 1) - GRAPH_V_SPACING / 2;
      positions[childId].x = parentPos.x + offsetX;
      positions[childId].y = parentPos.y + offsetY;
    });
  });
  // Compute overall width and height after repositioning excess nodes
  let maxX = 0;
  let maxY = 0;
  Object.values(positions).forEach(pos => {
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  });
  const width = maxX + GRAPH_NODE_WIDTH;
  const height = maxY + GRAPH_NODE_HEIGHT;
  // Build edge list: orientation depends on whether the child is an
  // excess node.  Coordinates are taken from positions, so they
  // reflect repositioned excess nodes.
  const edges = [];
  nodes.forEach(parent => {
    if (parent.inputs && parent.inputs.length > 0) {
      parent.inputs.forEach(child => {
        const parentId = nodeIds.get(parent);
        const childId = nodeIds.get(child);
        const parentPos = positions[parentId];
        const childPos = positions[childId];
        let startX, startY, endX, endY, label, midX, midY, excess;
        if (child.machineName === 'Excess') {
          // Excess edge: arrow flows from parent (right) to child (left)
          startX = parentPos.x;
          startY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = childPos.x + GRAPH_NODE_WIDTH;
          endY = childPos.y + GRAPH_NODE_HEIGHT / 2;
          label = `Excess ${child.recipeName} ${child.requiredOutputPerMin.toFixed(2)}/min`;
          excess = true;
        } else {
          // Normal edge: arrow flows from child (left) to parent (right)
          startX = childPos.x + GRAPH_NODE_WIDTH;
          startY = childPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = parentPos.x;
          endY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
          label = `${child.recipeName} ${child.requiredOutputPerMin.toFixed(2)}/min`;
          excess = false;
        }
        midX = (startX + endX) / 2;
        midY = (startY + endY) / 2 - 5;
        edges.push({ fromId: parentId, toId: childId, startX, startY, endX, endY, label, midX, midY, excess });
      });
    }
  });
  // Build nodes array with class names and positions
  const layoutNodes = nodes.map(node => {
    const id = nodeIds.get(node);
    const pos = positions[id];
    let cls;
    if (node.machineName === 'Excess') cls = 'excess';
    else if (node.machineName === 'Raw') cls = 'raw';
    else if (node === root) cls = 'final';
    else cls = 'machine';
    const utilPctStr = node.wholeMachines > 0 ? (node.utilisation * 100).toFixed(1) + '%' : '–';
    return {
      id,
      recipeName: node.recipeName,
      machineName: node.machineName,
      exactMachines: node.exactMachines,
      wholeMachines: node.wholeMachines,
      utilisation: utilPctStr,
      requiredOutputPerMin: node.requiredOutputPerMin,
      actualOutputPerMin: node.actualOutputPerMin,
      overproductionPerMin: node.overproductionPerMin,
      cls,
      x: pos.x,
      y: pos.y
    };
  });
  return { width, height, nodes: layoutNodes, edges };
}

/**
 * Combine multiple result trees into a single horizontal layout.  Each
 * tree is laid out individually, then shifted horizontally so they
 * appear side by side.  Returns a single layout object.
 *
 * @param {Array} results Array of objects { root, scaledFinal }
 * @returns {{width:number,height:number,nodes:Array,edges:Array}}
 */
function buildCombinedLayout(results) {
  // If no results, return empty layout
  if (!results || results.length === 0) {
    return { width: 0, height: 0, nodes: [], edges: [] };
  }
  // Determine the global maximum depth across all trees (excluding
  // excess nodes).  This ensures that when multiple targets are
  // displayed together, their raw resources align on the far left and
  // their final products align on the right.
  let globalMaxDepth = 0;
  results.forEach(res => {
    const depth = getMaxDepth(res.root);
    if (depth > globalMaxDepth) globalMaxDepth = depth;
  });
  const combinedNodes = [];
  const combinedEdges = [];
  let offsetY = 0;
  let maxWidth = 0;
  results.forEach((res, idx) => {
    // Insert excess nodes before layout
    const tree = insertExcessNodes(res.root);
    // Layout this tree using the global maximum depth to align columns
    const layout = layoutGraph(tree, globalMaxDepth);
    // Shift this layout vertically by the current offset
    layout.nodes.forEach(n => {
      combinedNodes.push({
        ...n,
        y: n.y + offsetY
      });
    });
    layout.edges.forEach(e => {
      combinedEdges.push({
        ...e,
        startY: e.startY + offsetY,
        endY: e.endY + offsetY,
        midY: e.midY + offsetY
      });
    });
    // Update the maximum width across all trees
    if (layout.width > maxWidth) maxWidth = layout.width;
    // Increase vertical offset for next tree (if any)
    offsetY += layout.height + GRAPH_V_SPACING;
  });
  // Remove extra spacing after last tree
  if (results.length > 1) {
    offsetY -= GRAPH_V_SPACING;
  }
  return { width: maxWidth, height: offsetY, nodes: combinedNodes, edges: combinedEdges };
}

/**
 * Populate the datalist with recipe names from the recipeBook.  Called
 * once on startup and whenever recipes are reloaded.
 */
function updateRecipeDatalist() {
  // Clear existing options
  recipeDatalist.innerHTML = '';
  Object.keys(recipeBook)
    .sort()
    .forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      recipeDatalist.appendChild(opt);
    });
}

function updateResourceDatalist() {
  const set = new Set();
  Object.keys(recipeBook).forEach(k => set.add(k));
  Object.values(recipeBook).forEach(r => (r.inputs || []).forEach(i => set.add(i.resource)));
  const list = Array.from(set).sort((a,b)=>a.localeCompare(b));
  const datalist = document.getElementById('resource-datalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  list.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    datalist.appendChild(opt);
  });
}


/**
 * Render the list of selected target recipes as tags with editable
 * machine counts and remove buttons.
 */
function renderSelectedTargets() {
  // Clear current contents
  selectedTargetsEl.innerHTML = '';
  const activeTab = getActiveTab();
  if (!activeTab || !activeTab.selectedTargets) return;
  // Render each selected target as a tag with the recipe name and
  // an editable rate input.  The rate represents the desired
  // production per minute of the selected recipe.  Users can
  // adjust the rate, which will influence the number of machines
  // required when computing the chain.  A remove button allows
  // deleting a target.
  activeTab.selectedTargets.forEach((t, idx) => {
    const tag = document.createElement('div');
    tag.classList.add('selected-target');
    // Label showing the recipe name
    const label = document.createElement('span');
    label.textContent = t.name;
    tag.appendChild(label);
    // Input for desired production rate (units per minute)
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.1';
    input.value = t.rate;
    input.title = 'Desired output per minute';
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (isNaN(val) || val <= 0) {
        // Reset invalid input to previous value
        input.value = t.rate;
        return;
      }
      t.rate = val;
      saveState();
    });
    tag.appendChild(input);
    // Rate units suffix
    const suffix = document.createElement('span');
    suffix.classList.add('rate-suffix');
    suffix.textContent = '/min';
    tag.appendChild(suffix);
    // Remove button
    const remove = document.createElement('span');
    remove.classList.add('remove');
    remove.innerHTML = '&times;';
    remove.title = 'Remove';
    remove.addEventListener('click', () => {
      activeTab.selectedTargets.splice(idx, 1);
      renderSelectedTargets();
      renderSupplyUI();
      renderByproductsUI();
      saveState();
    });
    tag.appendChild(remove);
    selectedTargetsEl.appendChild(tag);
  });
}

/**
 * Render the supply UI for external resource supply settings.
 */
function renderSupplyUI() {
  const tab = getActiveTab();
  if (!tab) return;
  if (supplyAutoscaleEl) supplyAutoscaleEl.checked = !!tab.supplyAutoscale;
  if (!supplyListEl) return;
  supplyListEl.innerHTML = '';
  const entries = Object.entries(tab.externalSupply || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  entries.forEach(([name, rate]) => {
    const row = document.createElement('div');
    row.className = 'supply-row';
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = name;
    const rateEl = document.createElement('input');
    rateEl.type = 'number';
    rateEl.min = '0';
    rateEl.step = '0.01';
    rateEl.value = String(rate);
    rateEl.addEventListener('change', () => {
      const v = parseFloat(rateEl.value);
      if (!isFinite(v) || v <= 0) delete tab.externalSupply[name];
      else tab.externalSupply[name] = v;
      saveState();
      compute();
    });
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Remove';
    delBtn.addEventListener('click', () => {
      delete tab.externalSupply[name];
      saveState();
      renderSupplyUI();
      compute();
    });
    row.appendChild(nameEl);
    row.appendChild(rateEl);
    row.appendChild(delBtn);
    supplyListEl.appendChild(row);
  });
}

/**
 * Add a supply from the input fields.
 */
function addSupplyFromInputs() {
  const tab = getActiveTab();
  if (!tab) return;
  const name = (supplyInputEl?.value || '').trim();
  const rate = parseFloat(supplyRateEl?.value || '0');
  if (!name || !isFinite(rate) || rate <= 0) return;
  tab.externalSupply[name] = rate;
  if (supplyInputEl) supplyInputEl.value = '';
  if (supplyRateEl) supplyRateEl.value = '';
  saveState();
  renderSupplyUI();
  compute();
}

/**
 * Add a target recipe by name if it exists and is not already selected.
 * Default machine count is 1.  After adding, clear the input and
 * re-render the selected target list.
 *
 * @param {string} name Recipe name from the datalist
 */
function addTargetByName(name) {
  if (!name) return;
  // Only add if the recipe exists in the recipe book
  const recipe = recipeBook[name];
  if (!recipe) {
    return;
  }
  const tab = getActiveTab();
  if (!tab) return;
  // Do not add duplicates
  const existing = tab.selectedTargets && tab.selectedTargets.find(t => t.name === name);
  if (existing) {
    return;
  }
  // Default rate is the output per minute of one machine for this recipe
  const defaultRate = outputPerMinute(recipe);
  if (!tab.selectedTargets) tab.selectedTargets = [];
  tab.selectedTargets.push({ name, rate: defaultRate });
  renderSelectedTargets();
  saveState();
}

/**
 * Remove all selected targets and clear the summary and results.
 */
function clearTargets() {
  const tab = getActiveTab();
  if (!tab) return;
  tab.selectedTargets = [];
  renderSelectedTargets();
  // Clear summary and graph for this tab
  tab.summary = '';
  tab.layout = null;
  if (tab.element) {
    tab.element.innerHTML = '';
  }
  summaryEl.textContent = '';
  saveState();
}

/**
 * Compute the production chains for all selected targets.  Uses
 * computeModeB with integer machine counts.  If autoScale is enabled,
 * each root machine count is scaled up so that immediate inputs can be
 * satisfied by whole machines.  After computation, summarises total
 * machines and outputs, then renders the combined graph.
 */

function collectByproducts(mergedLayout) {
  const map = {};
  if (!mergedLayout || !mergedLayout.nodes) return map;
  mergedLayout.nodes.forEach(n => {
    if (n && n.cls === 'excess') {
      map[n.recipeName] = (map[n.recipeName] || 0) + (n.requiredOutputPerMin || 0);
    }
  });
  return map;
}

function suggestFromExcess(excessMap) {
  const out = [];
  for (const recipe of Object.values(recipeBook)) {
    if (!recipe || !(recipe.inputs && recipe.inputs.length)) continue;
    let possible = Infinity;
    let ok = true;
    for (const inp of recipe.inputs) {
      const avail = excessMap[inp.resource] || 0;
      if (avail <= 0) { ok = false; break; }
      const maxOut = avail * (recipe.outputPerCycle / inp.amount);
      possible = Math.min(possible, maxOut);
    }
    if (!ok || !isFinite(possible) || possible <= 0) continue;
    out.push({ recipe: recipe.name, maxOutPerMin: possible, machine: recipe.machine });
  }
  out.sort((a,b)=>b.maxOutPerMin - a.maxOutPerMin);
  return out;
}

function renderByproductsUI() {
  const tab = getActiveTab();
  if (!tab) return;

  if (byproductsListEl) {
    byproductsListEl.innerHTML = '';
    const entries = Object.entries(tab.byproducts || {}).filter(([_,v])=>v>0).sort((a,b)=>a[0].localeCompare(b[0]));
    if (entries.length === 0) {
      byproductsListEl.innerHTML = '<div style="opacity:0.65;font-size:12px;">No excess/byproducts.</div>';
    } else {
      entries.forEach(([name,val]) => {
        const row = document.createElement('div');
        row.className = 'by-row';
        const n = document.createElement('div'); n.className='name'; n.textContent=name;
        const v = document.createElement('div'); v.className='val'; v.textContent = val.toFixed(2) + '/min';
        row.appendChild(n); row.appendChild(v);
        byproductsListEl.appendChild(row);
      });
    }
  }

  if (byproductsSuggestionsEl) {
    byproductsSuggestionsEl.innerHTML = '';
    const sugg = (tab.byproductSuggestions || []).slice(0, 20);
    if (sugg.length === 0) {
      byproductsSuggestionsEl.innerHTML = '<div style="opacity:0.65;font-size:12px;">No one-step recipes fully covered by current excess.</div>';
    } else {
      sugg.forEach(s => {
        const row = document.createElement('div');
        row.className = 'by-row';
        const n = document.createElement('div'); n.className='name'; n.textContent=s.recipe;
        const v = document.createElement('div'); v.className='val'; v.textContent=s.maxOutPerMin.toFixed(2) + '/min';
        const btn = document.createElement('button');
        btn.textContent='Add target';
        btn.addEventListener('click', () => {
          const tab2 = getActiveTab();
          if (!tab2) return;
          const r = recipeBook[s.recipe];
          const one = r ? outputPerMinute(r) : s.maxOutPerMin;
          const rate = Math.max(0.01, Math.min(one, s.maxOutPerMin));
          tab2.selectedTargets.push({ name: s.recipe, rate: rate.toFixed(2) });
          saveState();
          renderSelectedTargets();
          compute();
        });
        row.appendChild(n); row.appendChild(v); row.appendChild(btn);
        byproductsSuggestionsEl.appendChild(row);
      });
    }
  }
}


function computeExactRequirementsForTargets(targets) {
  const req = {};
  function add(name, amt){ if (!isFinite(amt)||amt<=0) return; req[name]=(req[name]||0)+amt; }
  function visit(productName, neededPerMin, path){
    const recipe = recipeBook[productName];
    if (!recipe){ add(productName, neededPerMin); return; }
    if (path.includes(productName)) throw new Error('Cyclic dependency detected: '+[...path,productName].join(' → '));
    const cyclesPerMin = neededPerMin / recipe.outputPerCycle;
    for (const input of (recipe.inputs||[])){
      visit(input.resource, cyclesPerMin*input.amount, path.concat(productName));
    }
  }
  targets.forEach(t=>visit(t.name, t.ratePerMin, []));
  return req;
}

function compute() {
  const tab = getActiveTab();
  if (!tab) return;
  // If no targets selected, do nothing
  if (!tab.selectedTargets || tab.selectedTargets.length === 0) {
    summaryEl.textContent = 'No target recipes selected.';
    if (tab.element) tab.element.innerHTML = '';
    tab.summary = '';
    tab.layout = null;
    saveState();
    return;
  }
  // autoScale is disabled for the root to prevent scaling the final machine count
  const autoScale = false;
  const results = [];
  const summaryLines = [];

  const externalSupply = tab.externalSupply || {};
  const supplyUsed = {};
  const supplyAutoscale = !!tab.supplyAutoscale;

  let scaleFactor = 1.0;
  if (supplyAutoscale && Object.keys(externalSupply).length > 0) {
    try {
      const targetList = (tab.selectedTargets || [])
        .map(t => ({ name: t.name, ratePerMin: parseFloat(t.rate) }))
        .filter(t => isFinite(t.ratePerMin) && t.ratePerMin > 0);
      const reqMap = computeExactRequirementsForTargets(targetList);
      const ratios = [];
      for (const [name, cap] of Object.entries(externalSupply)) {
        const capVal = parseFloat(cap);
        if (!isFinite(capVal) || capVal <= 0) continue;
        const req = reqMap[name];
        if (isFinite(req) && req > 0) ratios.push(Math.min(1, capVal / req));
      }
      if (ratios.length > 0) scaleFactor = Math.min(...ratios);
    } catch (e) {
      console.warn('Autoscale prepass failed', e);
    }
  }
  // Summarise final outputs and gather results for this tab's targets
  tab.selectedTargets.forEach(t => {
    const rate = parseFloat(t.rate);
    if (isNaN(rate) || rate <= 0) return;
    try {
      const recipe = recipeBook[t.name];
      const opm = outputPerMinute(recipe);
      const exactFinal = rate / opm;
      let rootCount = Math.ceil(exactFinal);
      // Compute chain without scaling the root
      const res = computeModeB(t.name, rootCount, autoScale, externalSupply, supplyUsed);
      // Override root properties: utilisation, exact machines, overproduction
      res.root.exactMachines = exactFinal;
      res.root.wholeMachines = rootCount;
      res.root.utilisation = rootCount > 0 ? exactFinal / rootCount : 0;
      res.root.requiredOutputPerMin = rate;
      res.root.actualOutputPerMin = rootCount * opm;
      res.root.overproductionPerMin = res.root.actualOutputPerMin - rate;
      results.push(res);
      summaryLines.push(`${t.name}: ${rate.toFixed(2)}/min → ${rootCount} ${recipe.machine}`);
    } catch (err) {
      summaryLines.push(`${t.name}: Error - ${err.message}`);
    }
  });
  // Summarise machine totals across all results using integer counts
  const totals = {};
  results.forEach(res => {
    summariseMachines(res.root, totals);
  });
  const totalsLines = [];
  Object.keys(totals).sort().forEach(machine => {
    totalsLines.push(`${machine}: ${totals[machine]}`);
  });
  // Build merged layout across all selected targets
  const layout = mergeResults(results, tab.selectedTargets.map(t => t.name));
  // Compose summary string for this computation
  const summaryString = summaryLines.join('\n') + (totalsLines.length > 0 ? '\n\nTotal machines:\n' + totalsLines.join('\n') : '');
  // Update tab's summary and layout
  tab.summary = summaryString;
  tab.layout = layout;
  // Update tab's label
  tab.label = tab.selectedTargets.map(t => t.name).join(', ');
  // Render graph into the tab's container
  if (!tab.element) {
    tab.element = document.createElement('div');
    tab.element.classList.add('tab-content');
    tab.element.style.width = '100%';
    tab.element.style.height = '100%';
    tab.element.style.position = 'relative';
    tab.element.style.overflow = 'hidden';
    resultsEl.appendChild(tab.element);
  }
  // Clear old content and render new graph
  renderGraphInContainer(layout, tab.element);
  // Update summary and tabs display
  renderTabs();
  renderActiveTab();
  renderByproductsUI();
  renderSupplyUI();
  saveState();
}

/**
 * Render a graph layout into a specific container element.  Similar to
 * renderGraphPanZoom but does not use the global resultsEl.  It
 * creates an interactive pan/zoom environment inside the given
 * container.  This allows multiple graph views to coexist in
 * separate tabs.
 *
 * @param {Object} layout The layout object with nodes and edges.
 * @param {HTMLElement} container The element in which to render the graph.
 */
function renderGraphInContainer(layout, container) {
  // Clear existing content in the container
  container.innerHTML = '';
  // Create outer wrapper for handling pan/zoom events
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'hidden';
  // Create inner content that will be transformed
  const content = document.createElement('div');
  content.style.position = 'absolute';
  content.style.left = '0';
  content.style.top = '0';
  content.style.transformOrigin = '0 0';
  wrapper.appendChild(content);
  container.appendChild(wrapper);
  // Early exit if no nodes
  if (!layout || !layout.nodes || layout.nodes.length === 0) {
    return;
  }
  // Create SVG for edges with extra padding to prevent edge clipping
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', layout.width + GRAPH_CANVAS_PADDING);
  svg.setAttribute('height', layout.height + GRAPH_CANVAS_PADDING);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  // Define arrow marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
  path.setAttribute('fill', '#ccd7e1');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);
  content.appendChild(svg);
  // Maps for node positions and DOM elements
  const nodePos = {};
  const nodeEls = {};
  // Create nodes
  layout.nodes.forEach(n => {
    nodePos[n.id] = { x: n.x, y: n.y };
    const div = document.createElement('div');
    div.classList.add('graph-node');
    div.classList.add(n.cls);
    div.dataset.id = n.id;
    // Build inner HTML based on node type
    const htmlParts = [];
    htmlParts.push(`<strong>${n.recipeName}</strong>`);
    if (n.cls === 'supply') {
      htmlParts.push(`<small>External</small>`);
      htmlParts.push(`<div>Output: ${n.actualOutputPerMin.toFixed(2)}/min</div>`);
      if (n.suppliedPerMin && n.suppliedPerMin > 0) {
        htmlParts.push(`<div class="muted">External: ${n.suppliedPerMin.toFixed(2)}/min</div>`);
      }
    } else if (n.cls === 'raw') {
      // Raw resources: show consumption rate
      htmlParts.push(`<small>Raw</small>`);
      htmlParts.push(`<div>Req: ${n.requiredOutputPerMin.toFixed(2)}/min</div>`);
    } else if (n.cls === 'excess') {
      // Excess nodes: show excess amount
      htmlParts.push(`<small>Excess</small>`);
      htmlParts.push(`<div>Excess: ${n.requiredOutputPerMin.toFixed(2)}/min</div>`);
    } else {
      // Machines and final products: show building type, utilisation and output
      // Do not repeat the machine name after the recipe name; instead use one line
      htmlParts.push(`<div>${n.machineName}: ${n.wholeMachines}</div>`);
      htmlParts.push(`<div>Utilization: ${n.utilisation}</div>`);
      htmlParts.push(`<div>Output: ${n.actualOutputPerMin.toFixed(2)}/min</div>`);
      if (n.suppliedPerMin && n.suppliedPerMin > 0) {
        htmlParts.push(`<div class="muted">External: ${n.suppliedPerMin.toFixed(2)}/min</div>`);
      }
      if (n.overproductionPerMin > 0.0001) {
        htmlParts.push(`<div style=\"color:#f3a3a3;\">Over: ${n.overproductionPerMin.toFixed(2)}/min</div>`);
      }
    }
    div.innerHTML = htmlParts.join('');
    div.style.left = n.x + 'px';
    div.style.top = n.y + 'px';
    content.appendChild(div);
    nodeEls[n.id] = div;
  });
  // Create edges
  const edgeElements = [];
  layout.edges.forEach(e => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', e.startX);
    line.setAttribute('y1', e.startY);
    line.setAttribute('x2', e.endX);
    line.setAttribute('y2', e.endY);
    line.setAttribute('stroke', '#8190a5');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(line);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', e.midX);
    text.setAttribute('y', e.midY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-edge-label');
    text.textContent = e.label;
    svg.appendChild(text);
    edgeElements.push({ fromId: e.fromId, toId: e.toId, line, label: text, excess: e.excess });
  });

  // Function to update the SVG and content boundaries based on current
  // node positions.  This ensures that as nodes are dragged beyond
  // the original dimensions of the graph, the SVG canvas (and
  // underlying content area) grows to fit them so edges and labels
  // are not cut off.  It is called initially and during dragging.
  function updateBoundary() {
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    Object.keys(nodePos).forEach(key => {
      const pos = nodePos[key];
      // Track minimum positions for nodes dragged to negative coordinates
      // Note: For nodes at negative coordinates, proper rendering would require
      // translating the entire SVG content. Current implementation handles the
      // common case of dragging towards positive boundaries (right/bottom edges).
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      // Include the node's width and height in the bounding box
      const right = pos.x + GRAPH_NODE_WIDTH;
      const bottom = pos.y + GRAPH_NODE_HEIGHT;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });
    // Add padding on all sides (multiply by 2 for both left and right, top and bottom)
    const newWidth = maxX - minX + GRAPH_CANVAS_PADDING * 2;
    const newHeight = maxY - minY + GRAPH_CANVAS_PADDING * 2;
    // Only update if larger than current size to avoid shrink
    const currentW = parseFloat(svg.getAttribute('width')) || 0;
    const currentH = parseFloat(svg.getAttribute('height')) || 0;
    if (newWidth > currentW) {
      svg.setAttribute('width', newWidth);
      content.style.width = newWidth + 'px';
    }
    if (newHeight > currentH) {
      svg.setAttribute('height', newHeight);
      content.style.height = newHeight + 'px';
    }
  }

  // Call updateBoundary once after creating nodes and edges to set
  // initial size.  This handles cases where the layout's reported
  // width/height is smaller than the bounding box of all nodes.
  updateBoundary();
  // Helper to update lines and labels when a node moves
  function updateEdgesForNode(nodeId) {
    edgeElements.forEach(edge => {
      if (edge.fromId === nodeId || edge.toId === nodeId) {
        const parentPos = nodePos[edge.fromId];
        const childPos = nodePos[edge.toId];
        let startX, startY, endX, endY;
        if (edge.excess) {
          startX = parentPos.x;
          startY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = childPos.x + GRAPH_NODE_WIDTH;
          endY = childPos.y + GRAPH_NODE_HEIGHT / 2;
        } else {
          startX = childPos.x + GRAPH_NODE_WIDTH;
          startY = childPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = parentPos.x;
          endY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
        }
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - 5;
        edge.line.setAttribute('x1', startX);
        edge.line.setAttribute('y1', startY);
        edge.line.setAttribute('x2', endX);
        edge.line.setAttribute('y2', endY);
        edge.label.setAttribute('x', midX);
        edge.label.setAttribute('y', midY);
      }
    });
  }
  // Zoom and pan state
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  function applyTransform() {
    content.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  // Wheel to zoom with anchor
  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const beforeX = (x - offsetX) / scale;
    const beforeY = (y - offsetY) / scale;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    scale *= zoomFactor;
    scale = Math.min(Math.max(scale, 0.3), 5);
    offsetX = x - beforeX * scale;
    offsetY = y - beforeY * scale;
    applyTransform();
  });
  // Right mouse panning
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  wrapper.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      e.preventDefault();
    }
  });
  wrapper.addEventListener('mousemove', (e) => {
    if (panning) {
      offsetX += e.clientX - panStartX;
      offsetY += e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      applyTransform();
      e.preventDefault();
    }
  });
  wrapper.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      panning = false;
    }
  });
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
  // Node dragging
  let draggingNode = null;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  content.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const nodeEl = e.target.closest('.graph-node');
    if (!nodeEl) return;
    draggingNode = nodeEl;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    e.stopPropagation();
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!draggingNode) return;
    const id = draggingNode.dataset.id;
    const dx = (e.clientX - dragStartClientX) / scale;
    const dy = (e.clientY - dragStartClientY) / scale;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    nodePos[id].x += dx;
    nodePos[id].y += dy;
    draggingNode.style.left = nodePos[id].x + 'px';
    draggingNode.style.top = nodePos[id].y + 'px';
    updateEdgesForNode(id);
    // Expand boundaries if necessary when dragging a node
    updateBoundary();
    e.preventDefault();
  });
  document.addEventListener('mouseup', (e) => {
    if (draggingNode && e.button === 0) {
      draggingNode = null;
    }
  });
  // Apply initial transform
  applyTransform();
}

/**
 * Render the tab bar based on the current list of tabs.  Each tab
 * shows the label (target recipes) and includes a close button.  The
 * active tab is highlighted.  Clicking on a tab activates it,
 * clicking on the close icon removes it.
 */
function renderTabs() {
  if (!tabBarEl) return;
  tabBarEl.innerHTML = '';
  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.classList.add('tab');
    if (tab.id === activeTabId) {
      tabEl.classList.add('active');
    }
    const titleSpan = document.createElement('span');
    titleSpan.textContent = tab.label;
    tabEl.appendChild(titleSpan);
    const closeSpan = document.createElement('span');
    closeSpan.classList.add('tab-close');
    closeSpan.innerHTML = '&times;';
    tabEl.appendChild(closeSpan);
    tabEl.addEventListener('click', (e) => {
      if (e.target === closeSpan) {
        closeTab(tab.id);
      } else {
        activeTabId = tab.id;
        renderTabs();
        renderActiveTab();
  renderByproductsUI();
  renderSupplyUI();
      }
      e.stopPropagation();
    });
    tabBarEl.appendChild(tabEl);
  });
  // Add a plus button at the end to create a new tab
  const plusEl = document.createElement('div');
  plusEl.classList.add('tab');
  plusEl.classList.add('new-tab');
  plusEl.textContent = '+';
  plusEl.addEventListener('click', () => {
    newTab();
  });
  tabBarEl.appendChild(plusEl);
}

/**
 * Render the active tab's content and summary.  Only the active tab's
 * graph container is displayed; others are hidden.
 */
function renderActiveTab() {
  tabs.forEach(tab => {
    if (!tab.element) return;
    if (tab.id === activeTabId) {
      tab.element.style.display = 'block';
      summaryEl.textContent = tab.summary;
    } else {
      tab.element.style.display = 'none';
    }
  });
  if (!activeTabId) {
    summaryEl.textContent = '';
  }
  // Update the target tags for the active tab
  renderSelectedTargets();
}

/**
 * Add a new tab with the given label, summary text, and graph layout.
 * The graph is rendered into its own container within the tab
 * container.  The new tab becomes the active tab.
 *
 * @param {string} label Label for the tab (names of target recipes).
 * @param {string} summary Summary text for machine counts and outputs.
 * @param {Object} layout Graph layout object to render.
 */
function addTab(label, summary, layout) {
  const id = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  const containerDiv = document.createElement('div');
  containerDiv.classList.add('tab-content');
  containerDiv.style.width = '100%';
  containerDiv.style.height = '100%';
  containerDiv.style.position = 'relative';
  containerDiv.style.overflow = 'hidden';
  resultsEl.appendChild(containerDiv);
  renderGraphInContainer(layout, containerDiv);
  tabs.push({ id, label, summary, layout, element: containerDiv });
  activeTabId = id;
  renderTabs();
  renderActiveTab();
  renderByproductsUI();
  renderSupplyUI();
}

/**
 * Close a tab by its id.  Removes the tab from the list and the
 * corresponding DOM element.  If the closed tab was active,
 * activates a neighbouring tab if one exists.
 *
 * @param {string} id The id of the tab to remove.
 */
function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  if (tab.element && tab.element.parentNode) {
    tab.element.parentNode.removeChild(tab.element);
  }
  tabs.splice(idx, 1);
  if (activeTabId === id) {
    if (tabs.length > 0) {
      const newIdx = idx > 0 ? idx - 1 : 0;
      activeTabId = tabs[newIdx].id;
    } else {
      activeTabId = null;
    }
  }
  renderTabs();
  renderActiveTab();
  renderByproductsUI();
  renderSupplyUI();
  saveState();
}

/**
 * Create a new blank tab.  This tab starts with no selected targets,
 * no summary and no layout.  It becomes the active tab.  The
 * selectedTargets UI is refreshed to reflect the new tab's state.
 */
function newTab() {
  const id = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  // Create a container element for the graph
  const containerDiv = document.createElement('div');
  containerDiv.classList.add('tab-content');
  containerDiv.style.width = '100%';
  containerDiv.style.height = '100%';
  containerDiv.style.position = 'relative';
  containerDiv.style.overflow = 'hidden';
  resultsEl.appendChild(containerDiv);
  // Create tab object with empty state
  const tab = {
    id,
    label: 'Untitled',
    summary: '',
    layout: null,
    element: containerDiv,
    selectedTargets: [],
    externalSupply: {},
    supplyAutoscale: false,
    byproducts: {},
    byproductSuggestions: []
  };
  tabs.push(tab);
  activeTabId = id;
  renderTabs();
  renderActiveTab();
  renderByproductsUI();
  renderSupplyUI();
  renderSelectedTargets();
  saveState();
}

/**
 * Render the combined layout in an interactive pan/zoom container.  The
 * user can zoom with the mouse wheel, pan by right‑clicking and
 * dragging, and reposition individual nodes by left‑clicking and
 * dragging them.  Edges stay connected as nodes move.
 *
 * @param {Object} layout The layout object with nodes and edges.
 */
function renderGraphPanZoom(layout) {
  // Clear existing content
  resultsEl.innerHTML = '';
  // Create outer wrapper for handling pan/zoom events
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.width = '100%';
  wrapper.style.height = '100%';
  wrapper.style.overflow = 'hidden';
  // Create inner content that will be transformed
  const content = document.createElement('div');
  content.style.position = 'absolute';
  content.style.left = '0';
  content.style.top = '0';
  content.style.transformOrigin = '0 0';
  wrapper.appendChild(content);
  resultsEl.appendChild(wrapper);
  // Early exit if no nodes
  if (!layout || !layout.nodes || layout.nodes.length === 0) {
    return;
  }
  // Create SVG for edges
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  // Define arrow marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
  path.setAttribute('fill', '#ccd7e1');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);
  content.appendChild(svg);
  // Maps for node positions and DOM elements
  const nodePos = {};
  const nodeEls = {};
  // Create nodes
    layout.nodes.forEach(n => {
    nodePos[n.id] = { x: n.x, y: n.y };
    const div = document.createElement('div');
    div.classList.add('graph-node');
    div.classList.add(n.cls);
    div.dataset.id = n.id;
    // Build inner HTML based on node type
    const htmlParts = [];
    htmlParts.push(`<strong>${n.recipeName}</strong>`);
    // Show different information depending on machine type
    if (n.cls === 'raw') {
      // Raw resources: show consumption rate
      htmlParts.push(`<small>Raw</small>`);
      htmlParts.push(`<div>Req: ${n.requiredOutputPerMin.toFixed(2)}/min</div>`);
    } else if (n.cls === 'excess') {
      // Excess nodes: show excess amount
      htmlParts.push(`<small>Excess</small>`);
      htmlParts.push(`<div>Excess: ${n.requiredOutputPerMin.toFixed(2)}/min</div>`);
    } else {
      // Machines and final products: show machine counts, utilisation and output
      htmlParts.push(`<small>${n.machineName}</small>`);
      htmlParts.push(`<div>Exact: ${n.exactMachines.toFixed(2)}</div>`);
      htmlParts.push(`<div>Whole: ${n.wholeMachines}</div>`);
      htmlParts.push(`<div>Util: ${n.utilisation}</div>`);
      htmlParts.push(`<div>Out: ${n.actualOutputPerMin.toFixed(2)}/min</div>`);
      if (n.overproductionPerMin > 0.0001) {
        htmlParts.push(`<div style="color:#f3a3a3;">Over: ${n.overproductionPerMin.toFixed(2)}/min</div>`);
      }
    }
    div.innerHTML = htmlParts.join('');
    div.style.left = n.x + 'px';
    div.style.top = n.y + 'px';
    content.appendChild(div);
    nodeEls[n.id] = div;
  });
  // Create edges
  const edgeElements = [];
  layout.edges.forEach(e => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', e.startX);
    line.setAttribute('y1', e.startY);
    line.setAttribute('x2', e.endX);
    line.setAttribute('y2', e.endY);
    line.setAttribute('stroke', '#8190a5');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(line);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', e.midX);
    text.setAttribute('y', e.midY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-edge-label');
    text.textContent = e.label;
    svg.appendChild(text);
    edgeElements.push({
      fromId: e.fromId,
      toId: e.toId,
      line,
      label: text,
      excess: e.excess
    });
  });
  // Helper to update lines and labels when a node moves
  function updateEdgesForNode(nodeId) {
    edgeElements.forEach(edge => {
      if (edge.fromId === nodeId || edge.toId === nodeId) {
        const parentPos = nodePos[edge.fromId];
        const childPos = nodePos[edge.toId];
        let startX, startY, endX, endY;
        if (edge.excess) {
          // Excess edge flows from parent to child
          startX = parentPos.x;
          startY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = childPos.x + GRAPH_NODE_WIDTH;
          endY = childPos.y + GRAPH_NODE_HEIGHT / 2;
        } else {
          // Normal edge flows from child to parent
          startX = childPos.x + GRAPH_NODE_WIDTH;
          startY = childPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = parentPos.x;
          endY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
        }
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2 - 5;
        edge.line.setAttribute('x1', startX);
        edge.line.setAttribute('y1', startY);
        edge.line.setAttribute('x2', endX);
        edge.line.setAttribute('y2', endY);
        edge.label.setAttribute('x', midX);
        edge.label.setAttribute('y', midY);
      }
    });
  }
  // Zoom and pan state
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  function applyTransform() {
    content.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }
  // Wheel to zoom.  Keep the point under the cursor stationary.
  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = wrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const beforeX = (x - offsetX) / scale;
    const beforeY = (y - offsetY) / scale;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    scale *= zoomFactor;
    // Clamp scale to reasonable bounds
    scale = Math.min(Math.max(scale, 0.3), 5);
    offsetX = x - beforeX * scale;
    offsetY = y - beforeY * scale;
    applyTransform();
  });
  // Right mouse button panning
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  wrapper.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      e.preventDefault();
    }
  });
  wrapper.addEventListener('mousemove', (e) => {
    if (panning) {
      offsetX += e.clientX - panStartX;
      offsetY += e.clientY - panStartY;
      panStartX = e.clientX;
      panStartY = e.clientY;
      applyTransform();
      e.preventDefault();
    }
  });
  wrapper.addEventListener('mouseup', (e) => {
    if (e.button === 2) {
      panning = false;
    }
  });
  wrapper.addEventListener('contextmenu', (e) => {
    // Prevent context menu on right click
    e.preventDefault();
  });
  // Node dragging with left mouse button
  let draggingNode = null;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  content.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const nodeEl = e.target.closest('.graph-node');
    if (!nodeEl) return;
    draggingNode = nodeEl;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    e.stopPropagation();
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!draggingNode) return;
    const id = draggingNode.dataset.id;
    // Movement in pixels relative to current zoom
    const dx = (e.clientX - dragStartClientX) / scale;
    const dy = (e.clientY - dragStartClientY) / scale;
    dragStartClientX = e.clientX;
    dragStartClientY = e.clientY;
    nodePos[id].x += dx;
    nodePos[id].y += dy;
    draggingNode.style.left = nodePos[id].x + 'px';
    draggingNode.style.top = nodePos[id].y + 'px';
    updateEdgesForNode(id);
    e.preventDefault();
  });
  document.addEventListener('mouseup', (e) => {
    if (draggingNode && e.button === 0) {
      draggingNode = null;
    }
  });
  // Apply initial transform
  applyTransform();
}

/**
 * Persist the current tab state to localStorage.  Each tab's
 * selectedTargets, label and summary are saved.  Layouts are
 * recomputed on load, so they are not stored.  The active tab
 * index is also saved.
 */
function saveState() {
  try {
    const data = {
      tabs: tabs.map(t => ({
        selectedTargets: t.selectedTargets || [],
        label: t.label || 'Untitled',
        summary: t.summary || '',
        externalSupply: t.externalSupply || {},
        supplyAutoscale: !!t.supplyAutoscale,
        byproducts: t.byproducts || {},
        byproductSuggestions: t.byproductSuggestions || []
      })),
      activeIndex: tabs.findIndex(t => t.id === activeTabId)
    };
    localStorage.setItem('factoryChainState', JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

/**
 * Load the saved tab state from localStorage.  Reconstructs each
 * tab with its selectedTargets, then computes summary and layout for
 * each.  Restores the active tab.  If no saved state exists,
 * initializes with a single blank tab.
 */
function loadState() {
  try {
    const saved = localStorage.getItem('factoryChainState');
    if (!saved) {
      // Create one default tab
      newTab();
      return;
    }
    const data = JSON.parse(saved);
    if (!data || !Array.isArray(data.tabs)) {
      newTab();
      return;
    }
    // Clear any existing tabs
    while (tabs.length > 0) {
      const tab = tabs.pop();
      if (tab.element && tab.element.parentNode) {
        tab.element.parentNode.removeChild(tab.element);
      }
    }
    activeTabId = null;
    // Recreate each saved tab
    data.tabs.forEach(tabInfo => {
      const id = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
      const containerDiv = document.createElement('div');
      containerDiv.classList.add('tab-content');
      containerDiv.style.width = '100%';
      containerDiv.style.height = '100%';
      containerDiv.style.position = 'relative';
      containerDiv.style.overflow = 'hidden';
      resultsEl.appendChild(containerDiv);
      const tab = {
        id,
        label: tabInfo.label || 'Untitled',
        summary: '',
        layout: null,
        element: containerDiv,
        selectedTargets: tabInfo.selectedTargets || [],
        externalSupply: tabInfo.externalSupply || {},
        supplyAutoscale: !!tabInfo.supplyAutoscale,
        byproducts: tabInfo.byproducts || {},
        byproductSuggestions: tabInfo.byproductSuggestions || []
      };
      tabs.push(tab);
    });
    // Restore active tab index
    if (typeof data.activeIndex === 'number' && data.activeIndex >= 0 && data.activeIndex < tabs.length) {
      activeTabId = tabs[data.activeIndex].id;
    } else if (tabs.length > 0) {
      activeTabId = tabs[0].id;
    }
    // Compute each tab's layout and summary
    tabs.forEach((tab, idx) => {
      // Temporarily set activeTabId to compute correctly (selectedTargets uses active tab)
      activeTabId = tab.id;
      renderSelectedTargets();
      // Compute layout if there are targets
      if (tab.selectedTargets && tab.selectedTargets.length > 0) {
        // Use compute() but ensure it updates the tab rather than creating a new tab
        const originalSelected = tab.selectedTargets.slice();
        // We avoid side effects by computing manually like compute() but not creating a new tab
        const results = [];
        const summaryLines = [];
        tab.selectedTargets.forEach(t => {
          const rate = parseFloat(t.rate);
          if (isNaN(rate) || rate <= 0) return;
          try {
            const recipe = recipeBook[t.name];
            const opm = outputPerMinute(recipe);
            const exactFinal = rate / opm;
            const rootCount = Math.ceil(exactFinal);
            const res = computeModeB(t.name, rootCount, false);
            res.root.exactMachines = exactFinal;
            res.root.wholeMachines = rootCount;
            res.root.utilisation = rootCount > 0 ? exactFinal / rootCount : 0;
            res.root.requiredOutputPerMin = rate;
            res.root.actualOutputPerMin = rootCount * opm;
            res.root.overproductionPerMin = res.root.actualOutputPerMin - rate;
            results.push(res);
            summaryLines.push(`${t.name}: ${rate.toFixed(2)}/min → ${rootCount} ${recipe.machine}`);
          } catch (err) {
            summaryLines.push(`${t.name}: Error - ${err.message}`);
          }
        });
        const totals = {};
        results.forEach(r => summariseMachines(r.root, totals));
        const totalsLines = [];
        Object.keys(totals).sort().forEach(machine => {
          totalsLines.push(`${machine}: ${totals[machine]}`);
        });
        const layout = mergeResults(results, tab.selectedTargets.map(t => t.name));
        tab.layout = layout;
        tab.summary = summaryLines.join('\n') + (totalsLines.length > 0 ? '\n\nTotal machines:\n' + totalsLines.join('\n') : '');
        renderGraphInContainer(layout, tab.element);
      }
    });
    // Restore UI for active tab
    renderTabs();
    renderActiveTab();
  renderByproductsUI();
  renderSupplyUI();
    renderSelectedTargets();
  } catch (e) {
    console.error('Failed to load state:', e);
    // Fallback: create a blank tab
    newTab();
  }
}

// Event wiring for the auto-complete and compute buttons
updateRecipeDatalist();
updateResourceDatalist();
// Load saved state or create default tab
loadState();
// Add selected target on Enter key in the input or when an option is chosen
targetInput.addEventListener('change', () => {
  addTargetByName(targetInput.value.trim());
  targetInput.value = '';
});
targetInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addTargetByName(targetInput.value.trim());
    targetInput.value = '';
    e.preventDefault();
  }
});
clearTargetsBtn.addEventListener('click', () => {
  clearTargets();
});
computeBtn.addEventListener('click', () => {
  compute();
});

// Event listeners for external supply
if (addSupplyBtnEl) {
  addSupplyBtnEl.addEventListener('click', () => {
    addSupplyFromInputs();
  });
}
if (supplyInputEl) {
  supplyInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addSupplyFromInputs();
      e.preventDefault();
    }
  });
}
if (supplyRateEl) {
  supplyRateEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addSupplyFromInputs();
      e.preventDefault();
    }
  });
}
if (supplyAutoscaleEl) {
  supplyAutoscaleEl.addEventListener('change', () => {
    const tab = getActiveTab();
    if (tab) {
      tab.supplyAutoscale = supplyAutoscaleEl.checked;
      saveState();
      compute();
    }
  });
}

/*
// Build textual representation of results for copy/export
function buildText(node, indent = 0) {
  const lines = [];
  const utilPct = node.wholeMachines > 0 ? (node.utilisation * 100).toFixed(1) + '%' : '–';
  lines.push(
    `${'  '.repeat(indent)}${node.recipeName}: ${node.machineName} machines ${node.exactMachines.toFixed(2)} exact, ${node.wholeMachines} whole, util ${utilPct}, req ${node.requiredOutputPerMin.toFixed(2)}, act ${node.actualOutputPerMin.toFixed(2)}, over ${node.overproductionPerMin.toFixed(2)}`
  );
  for (const child of node.inputs) {
    lines.push(...buildText(child, indent + 1));
  }
  return lines;
}

// Build CSV rows from results
function buildCsvRows(node, rows = []) {
  rows.push([
    node.recipeName,
    node.machineName,
    node.exactMachines.toFixed(2),
    node.wholeMachines,
    node.wholeMachines > 0 ? (node.utilisation * 100).toFixed(1) + '%' : '–',
    node.requiredOutputPerMin.toFixed(2),
    node.actualOutputPerMin.toFixed(2),
    node.overproductionPerMin.toFixed(2)
  ]);
  for (const child of node.inputs) {
    buildCsvRows(child, rows);
  }
  return rows;
}

/*
// UI elements for the redesigned dark theme
const recipeDatalist = document.getElementById('recipe-datalist');
const targetInput = document.getElementById('target-input');
const selectedTargetsEl = document.getElementById('selected-targets');
const supplyListEl = document.getElementById('supply-list');
const supplyInputEl = document.getElementById('supply-input');
const supplyRateEl = document.getElementById('supply-rate');
const addSupplyBtnEl = document.getElementById('add-supply-btn');
const supplyAutoscaleEl = document.getElementById('supply-autoscale');
const byproductsListEl = document.getElementById('byproducts-list');
const byproductsSuggestionsEl = document.getElementById('byproducts-suggestions');
const clearTargetsBtn = document.getElementById('clear-targets-btn');
const computeBtn = document.getElementById('compute-btn');
const summaryEl = document.getElementById('summary');
const resultsEl = document.getElementById('results');

// State: selected target recipes with counts
let selectedTargets = [];
let lastLayout = null;

// Keep track of last result for copy/export
let lastResult = null;

// Configuration for graph layout (node dimensions and spacing)
const GRAPH_NODE_WIDTH = 200;
const GRAPH_NODE_HEIGHT = 80;
const GRAPH_H_SPACING = 120;
const GRAPH_V_SPACING = 40;

// Compute a horizontal layout for the result tree.  Returns an object
// containing nodes with positions and edges with coordinates and labels,
// as well as total width and height.  The layout arranges the root
// recipe at depth 0 on the left, and deeper recipes progressively
// further to the right.  Each level (depth) is laid out in its own
// column, and nodes in the same column are stacked vertically.
function layoutGraph(root) {
  const levels = {};
  const nodes = [];
  const nodeIds = new Map();
  let idCounter = 0;
  // Recursively traverse the tree to populate levels and assign ids
  function collect(n, depth) {
    const id = 'n' + (idCounter++);
    nodeIds.set(n, id);
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(n);
    nodes.push(n);
    if (n.inputs && n.inputs.length > 0) {
      n.inputs.forEach(child => collect(child, depth + 1));
    }
  }
  collect(root, 0);
  const depths = Object.keys(levels).map(d => parseInt(d, 10));
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
  const maxRows = depths.reduce((acc, d) => Math.max(acc, levels[d].length), 1);
  // Compute positions.  Place the deepest level on the left so that
  // raw resources appear on the left and the final product appears on
  // the right.  This inversion is achieved by subtracting the depth
  // from the maximum depth when calculating the x coordinate.
  const positions = {};
  depths.forEach(d => {
    const column = levels[d];
    column.forEach((node, rowIndex) => {
      // invert depth: deepest level (maxDepth) at x=0, root at x=maxDepth
      const x = (maxDepth - d) * (GRAPH_NODE_WIDTH + GRAPH_H_SPACING);
      const y = rowIndex * (GRAPH_NODE_HEIGHT + GRAPH_V_SPACING);
      positions[nodeIds.get(node)] = { x, y, nodeRef: node };
    });
  });
  const width = (maxDepth + 1) * (GRAPH_NODE_WIDTH + GRAPH_H_SPACING);
  const height = maxRows * (GRAPH_NODE_HEIGHT + GRAPH_V_SPACING) + GRAPH_V_SPACING;
  // Build edges with coordinates and labels.  For normal input edges,
  // arrows flow from the upstream (child) node on the left to the
  // downstream (parent) node on the right.  However, for excess
  // nodes (nodes with machineName === 'Excess'), the arrow is drawn
  // from the parent to the excess child (i.e., right to left).  A
  // flag `excess` is attached to each edge for later styling and
  // updating during node dragging.
  const edges = [];
  nodes.forEach(parent => {
    if (parent.inputs && parent.inputs.length > 0) {
      parent.inputs.forEach(child => {
        const parentId = nodeIds.get(parent);
        const childId = nodeIds.get(child);
        const parentPos = positions[parentId];
        const childPos = positions[childId];
        let startX, startY, endX, endY, label, midX, midY, excess;
        if (child.machineName === 'Excess') {
          // Draw from parent to excess child (right to left).  Start at
          // the left side of the parent and end at the right side of the
          // excess node.  Label indicates overproduction.
          startX = parentPos.x;
          startY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = childPos.x + GRAPH_NODE_WIDTH;
          endY = childPos.y + GRAPH_NODE_HEIGHT / 2;
          label = `Excess ${child.recipeName} ${child.requiredOutputPerMin.toFixed(2)}/min`;
          excess = true;
        } else {
          // Normal input edge: draw from child to parent (left to right).
          startX = childPos.x + GRAPH_NODE_WIDTH;
          startY = childPos.y + GRAPH_NODE_HEIGHT / 2;
          endX = parentPos.x;
          endY = parentPos.y + GRAPH_NODE_HEIGHT / 2;
          label = `${child.recipeName} ${child.requiredOutputPerMin.toFixed(2)}/min`;
          excess = false;
        }
        midX = (startX + endX) / 2;
        midY = (startY + endY) / 2 - 5;
        edges.push({ fromId: parentId, toId: childId, startX, startY, endX, endY, label, midX, midY, excess });
      });
    }
  });
  // Build nodes array with class names
  const layoutNodes = nodes.map(node => {
    const id = nodeIds.get(node);
    const pos = positions[id];
    let cls;
    if (node.machineName === 'Excess') {
      cls = 'excess';
    } else if (node.machineName === 'Raw') {
      cls = 'raw';
    } else if (node === root) {
      cls = 'final';
    } else {
      cls = 'machine';
    }
    // Determine utilisation percentage string
    const utilPctStr = node.wholeMachines > 0 ? (node.utilisation * 100).toFixed(1) + '%' : '–';
    return {
      id,
      recipeName: node.recipeName,
      machineName: node.machineName,
      exactMachines: node.exactMachines,
      wholeMachines: node.wholeMachines,
      utilisation: utilPctStr,
      requiredOutputPerMin: node.requiredOutputPerMin,
      actualOutputPerMin: node.actualOutputPerMin,
      overproductionPerMin: node.overproductionPerMin,
      cls,
      x: pos.x,
      y: pos.y
    };
  });
  return { width, height, nodes: layoutNodes, edges };
}

// Render the graph layout into the #results element.  Creates a
// scrollable container with an SVG for lines and divs for nodes.  The
// SVG includes arrow markers and labels on edges.  Node divs are
// absolutely positioned using the x,y coordinates from the layout.
function renderGraph(layout) {
  // Create container
  const container = document.createElement('div');
  container.classList.add('graph-container');
  container.style.width = layout.width + 'px';
  container.style.height = layout.height + 'px';
  // Create SVG overlay for edges
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', layout.width);
  svg.setAttribute('height', layout.height);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  // Define arrow marker
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '10');
  marker.setAttribute('markerHeight', '10');
  marker.setAttribute('refX', '10');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L0,6 L9,3 z');
  path.setAttribute('fill', '#ccd7e1');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);
  // Draw edges
  layout.edges.forEach(edge => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', edge.startX);
    line.setAttribute('y1', edge.startY);
    line.setAttribute('x2', edge.endX);
    line.setAttribute('y2', edge.endY);
    line.setAttribute('stroke', '#8190a5');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('marker-end', 'url(#arrow)');
    svg.appendChild(line);
    // Edge label
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', edge.midX);
    text.setAttribute('y', edge.midY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'graph-edge-label');
    text.textContent = edge.label;
    svg.appendChild(text);
  });
  container.appendChild(svg);
  // Create node elements
  layout.nodes.forEach(n => {
    const div = document.createElement('div');
    div.classList.add('graph-node');
    div.classList.add(n.cls);
    div.style.left = n.x + 'px';
    div.style.top = n.y + 'px';
    // Build inner HTML: recipe name, machine, counts and utilisation
    const htmlParts = [];
    htmlParts.push(`<strong>${n.recipeName}</strong>`);
    htmlParts.push(`<small>${n.machineName}</small>`);
    htmlParts.push(`<div>Exact: ${n.exactMachines.toFixed(2)}</div>`);
    htmlParts.push(`<div>Whole: ${n.wholeMachines}</div>`);
    htmlParts.push(`<div>Util: ${n.utilisation}</div>`);
    htmlParts.push(`<div>Output: ${n.actualOutputPerMin.toFixed(2)}/min</div>`);
      if (n.suppliedPerMin && n.suppliedPerMin > 0) {
        htmlParts.push(`<div class="muted">External: ${n.suppliedPerMin.toFixed(2)}/min</div>`);
      }
    if (n.overproductionPerMin > 0.0001) {
      htmlParts.push(`<div style="color:#f3a3a3;">Over: ${n.overproductionPerMin.toFixed(2)}/min</div>`);
    }
    div.innerHTML = htmlParts.join('');
    container.appendChild(div);
  });
  resultsEl.appendChild(container);
}

// Initial UI setup
updateRecipeList('');
updateTargetOptions();
// Set initial selection
if (Object.keys(recipeBook).length) {
  selectRecipe(Object.keys(recipeBook).sort()[0]);
}
onModeChange();
*/