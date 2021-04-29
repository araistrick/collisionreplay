window.HELP_IMPROVE_VIDEOJS = false;

state = {}
state['index'] = 0
state['source'] = 'noisy'
state['show_occupied'] = false
state['canvas_width'] = 512
state['canvas_height'] = 512
state['selected_point'] = 1200
state['show_polar'] = true

var vis_options = {
  'circle_rad': 4,
  'max_example_index': 4,
  'heatmap_bin_width': 16,
  'heatmap_bin_height': 46,
  'heatmap_inner_radius': 60,
  'heatmap_outer_radius': 256,
  'heatmap_start_angle': -90
}

// from https://github.com/timothygebhard/js-colormaps/blob/master/overview.html
function enforceBounds(x) {
  if (x < 0) {
      return 0;
  } else if (x > 1){
      return 1;
  } else {
      return x;
  }
}

// from https://github.com/timothygebhard/js-colormaps/blob/master/overview.html
function interpolateLinearly(x, values) {

  // Split values into four lists
  var x_values = [];
  var r_values = [];
  var g_values = [];
  var b_values = [];
  for (i in values) {
      x_values.push(values[i][0]);
      r_values.push(values[i][1][0]);
      g_values.push(values[i][1][1]);
      b_values.push(values[i][1][2]);
  }

  var i = 1;
  while (x_values[i] < x) {
      i = i+1;
  }
  i = i-1;

  var width = Math.abs(x_values[i] - x_values[i+1]);
  var scaling_factor = (x - x_values[i]) / width;

  // Get the new color values though interpolation
  var r = r_values[i] + scaling_factor * (r_values[i+1] - r_values[i])
  var g = g_values[i] + scaling_factor * (g_values[i+1] - g_values[i])
  var b = b_values[i] + scaling_factor * (b_values[i+1] - b_values[i])

  r = Math.round(255 * enforceBounds(r))
  g = Math.round(255 * enforceBounds(g))
  b = Math.round(255 * enforceBounds(b))
  
  return 'rgb(' + r + ', ' + g + ', ' + b + ')';
}

function getCanvasLocation(point) {
  canvas = document.getElementById("overlay-canvas")
  x = canvas.width * (0.5 + point[0] / 2)
  y = canvas.height * (0.5 + point[1] / 2)
  return [x, y]
}

function drawImageOverlay() {
  // update image canvas
  canvas = document.getElementById("overlay-canvas");
  ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  canvas.width = state['canvas_width'];
  canvas.height = state['canvas_height'];
  ctx.drawImage(state['image'], 0, 0, state['canvas_width'], state['canvas_height'])

  function drawPoint(point_data, rad=vis_options['circle_rad'], check_occupied=true) {

    if (check_occupied && !state['show_occupied'] && point_data['pred_df'] == 0) return;
    
    const [x, y] = getCanvasLocation(point_data['project_points'])
    
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI, false)
    ctx.fill()
  }

  max_df = 2
  for (const point_data of state['data']) {
    if (point_data['pred_df'] > max_df)
      max_df = point_data['pred_df']
  }

  // plot points
  for (const [i, point_data] of state['data'].entries()) {
    ctx.fillStyle = interpolateLinearly(point_data['pred_df'] / max_df, plasma)
    drawPoint(point_data)
  }

  //plot the currently selected point
  if (state['selected_point'] != null) {
    ctx.fillStyle = 'black'
    ctx.strokeStyle = 'white'
    ctx.lineWidth = 4
    drawPoint(state['data'][state['selected_point']], rad=3*vis_options['circle_rad'], check_occupied=false)
    ctx.stroke()
  }   
}

function polarToCart(a, r, cx, cy) {
  const x = r * Math.cos(a * (Math.PI / 180))
  const y = r * Math.sin(a * (Math.PI / 180))
  return [-x + cx, y + cy]
}

function drawDistribution() {

  canvas = document.getElementById("distribution-canvas");
  ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  probs = state['data'][state['selected_point']]['probs']
  for (let c = 0; c < probs.length; c++) {

    for (let r = 0; r < probs[c].length; r++) {

      ctx.fillStyle = interpolateLinearly(probs[c][r], plasma)

      if (state['show_polar']) {
        
        rad_per_shell = (vis_options['heatmap_outer_radius'] - vis_options['heatmap_inner_radius']) / probs[c].length

        // compute segment angles and radii
        const angle_per_col = 360 / probs.length 
        const a1 = (-c - 0.5) * angle_per_col + vis_options['heatmap_start_angle']
        const a2 = (-c + 0.5) * angle_per_col + vis_options['heatmap_start_angle']
        const r1 = vis_options['heatmap_inner_radius'] + rad_per_shell * r
        const r2 = r1 + rad_per_shell

        // calculate center
        const cx = canvas.width / 2
        const cy = canvas.height / 2

        // compute center
        ctx.beginPath()
        ctx.moveTo(...polarToCart(a1, r1, cx, cy))
        ctx.lineTo(...polarToCart(a1, r2, cx, cy))
        ctx.lineTo(...polarToCart(a2, r2, cx, cy))
        ctx.lineTo(...polarToCart(a2, r1, cx, cy))
        ctx.lineTo(...polarToCart(a1, r1, cx, cy))
        
        ctx.fill()
        
      }
      else {
        y = (probs[c].length - r - 1) * vis_options['heatmap_bin_height'] // invert vertical
        x = ((c + probs.length / 2) % probs.length) * vis_options['heatmap_bin_width'] // align 0 index to center
      
        ctx.fillRect(x, y, vis_options['heatmap_bin_width'], vis_options['heatmap_bin_height'])

      }      
    }    
  }
}

function findClosestDataPoint(px, py) {

  function sqdist(p) {
    const [x, y] = getCanvasLocation(p['project_points'])
    return (x - px) * (x - px) + (y - py) * (y - py)
  }

  best = 0
  best_dist = sqdist(state['data'][best])

  for (const [i, point_data] of state['data'].entries()) {
    candidate_dist = sqdist(point_data)
    if (candidate_dist < best_dist) {
      best = i
      best_dist = candidate_dist
    }
  }

  return best
}

function updateAll() {

  example_path = './static/examples/' + String(state['index'])

  // update image
  state['image'] = new Image()
  state['image'].src =  example_path + '/img.jpg'
  state['image'].ondragstart = function() { return false; };
  state['image'].oncontextmenu = function() { return false; };

  // start the loader spinner
  $('.loader-wrapper').addClass('is-active')

  json_path = example_path + '/' + state['source'] + '.json'
  console.log("Loading " + json_path)
  $.getJSON(json_path, function(data) {
    
    $('.loader-wrapper').removeClass('is-active')
    
    state['data'] = data
    drawImageOverlay()
    drawDistribution()

  });

  // blank out any navigation buttons that arent going to do anything
  document.getElementById('prev-example-button').disabled = (state['index'] == 0)
  document.getElementById('next-example-button').disabled = (state['index'] == vis_options['max_example_index'])
}

$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");

    });

    var options = {
			slidesToScroll: 1,
			slidesToShow: 3,
			loop: true,
			infinite: true,
			autoplay: false,
			autoplaySpeed: 3000,
    }

		// Initialize all div with carousel class
    var carousels = bulmaCarousel.attach('.carousel', options);

    // Loop on each carousel initialized
    for(var i = 0; i < carousels.length; i++) {
    	// Add listener to  event
    	carousels[i].on('before:show', state => {
    		console.log(state);
    	});
    }

    // Access to bulmaCarousel instance of an element
    var element = document.querySelector('#my-element');
    if (element && element.bulmaCarousel) {
    	// bulmaCarousel instance is available as element.bulmaCarousel
    	element.bulmaCarousel.on('before-show', function(state) {
    		console.log(state);
    	});
    }

    $('#prev-example-button').on('click', function(event) {
      if (state['index'] > 0) {
        state['index'] -= 1
        updateAll()
      }
    });
    
    $('#next-example-button').on('click', function(event) {
      if (state['index'] < vis_options['max_example_index']) {
        state['index'] += 1
        updateAll()
      }
    });

    $('#noisy-training-box').on('click', function(event) {
      if (document.getElementById("noisy-training-box").checked) {
        state['source'] = 'noisy'
      }
      else {  
        state['source'] = 'nonoise'
      }
      updateAll()
    });
    
    $('#show-occupied-box').on('click', function(event) {
      state['show_occupied'] = document.getElementById("show-occupied-box").checked
      drawImageOverlay()
    });

    $('#use-polar-box').checked = state['show_polar']
    $('#use-polar-box').on('click', function(event) {
      state['show_polar'] = document.getElementById("use-polar-box").checked
      drawDistribution()
    });


    $('#overlay-canvas').on('click', function(event) {
      canvas = document.getElementById("overlay-canvas");
      let rect = canvas.getBoundingClientRect()
      let x = event.clientX - rect.left;
      let y = event.clientY - rect.top;
      state['selected_point'] = findClosestDataPoint(x, y)
      drawImageOverlay()
      drawDistribution()
    })


    updateAll()

})
