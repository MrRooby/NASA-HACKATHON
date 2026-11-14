function compare_telemetry(dataJSON, type){
  var checkboxes = document.getElementsByName("checked-missions")
  var missions = []
  var missions_str = ""
  for (var i=0; i<checkboxes.length; i++) {
     if (checkboxes[i].checked) {
        missions.push(checkboxes[i].value); 
        missions_str = missions_str + checkboxes[i].value + ";"
     }
  }

  log_message("Mission comparison: Telemetry " + missions_str)
  var dataJSON = JSON.parse(dataJSON.telemetry_data)

  
  data_ground = []
  data_iss = []
  no_data = ""
  for(var i=0; i<missions.length; i++){
    mission = missions[i]
    var time = dataJSON['time_' + mission]
    var trace_ground = dataJSON[type + '_ground_' + mission]
    var trace_iss = dataJSON[type + '_iss_' + mission]

    
    console.log(type)
    if(type == "temperature"){
      yaxis = "Degrees [C]"
      title = "Temperature"
    }else if(type == "rh"){
      yaxis = "RH [%]"
      title = "Relative Humidity (RH)"
    }else if(type =="co2"){
      yaxis = "CO2 [ppm]"
      title = "CO2"
    }

    if(trace_iss == undefined){
      no_data +=  mission + "," 
    }else{

      if(mission != "RR-18"){
        data_ground.push({
          type : 'scatter',
          mode : 'lines',
          name : mission,
          x: time,
          y: trace_ground
        })
      }
      data_iss.push({
        type : 'scatter',
        mode : 'lines',
        name : mission,
        x: time,
        y: trace_iss
      })
    }
  }

  

  var layout_ground = {
    title: title + ", Ground",
    yaxis: {
      title: {
        text: yaxis,
        //text: "test"
      }
    },
    xaxis: {
      title: {
        text: "Days after launch",
      }
    },
  }

  var layout_iss = {
    title: title + ", ISS",
    yaxis: {
      title: {
        text: yaxis,
      }
    },
    xaxis: {
      title: {
        text: "Days after launch",
      }
    },
  }

  Plotly.newPlot("compare_iss", data_iss, layout_iss);
  Plotly.newPlot("compare_ground", data_ground, layout_ground);

  if(no_data != ""){
    document.getElementById("error_message").innerHTML = "No " + type + " data available for " + no_data.substring(0,no_data.length-1);
  }else{
    document.getElementById("error_message").innerHTML = ""
  }
}

function compare_radiation(dataJSON){
  var checkboxes = document.getElementsByName("checked-missions")
  var missions = []
  var missions_str = ""
  for (var i=0; i<checkboxes.length; i++) {
     if (checkboxes[i].checked) {
        missions.push(checkboxes[i].value);
        missions_str = missions_str + checkboxes[i].value + ";"
     }
  }

  log_message("Mission comparison: Radiation " + missions_str)
  var years = {
    "RR-1" : 2014,
    "RR-3" : 2016, 
    "RR-4" : 2017, 
    "RR-5" : 2017, 
    "RR-6" : 2017, 
    "RR-7" : 2018,
    "RR-8": 2018,
    "RR-9": 2018,
    "RR-12": 2019, 
    "RR-17": 2019,
    "RR-18": 2021,
    "RR-19": 2019
  }
  var dataJSON = JSON.parse(dataJSON.radiation_data)

  console.log(missions)
  console.log(dataJSON)
  data_gcr = []
  data_saa = []
  data_total = []
  data_accumulated = []
  colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2','#7f7f7f', '#bcbd22', '#17becf']
  no_data = ""
  for(var i=0; i<missions.length; i++){
    if(i<10){var j=i}else{var j=i-10}
    mission = missions[i]
    var time = dataJSON['time_' + mission]
    var trace_gcr = dataJSON['gcr_' + mission]

    if(trace_gcr == undefined){
      no_data += mission + "," 
    }else{

      var trace_saa = dataJSON['saa_' + mission]
      var trace_total = dataJSON['total_' + mission]
      var trace_accumulated = dataJSON['accumulated_' + mission]

      data_gcr.push({
        type : 'scatter',
        mode : 'lines',
        name : mission,
        x: time,
        y: trace_gcr,
        line: {color: colors[j]},
        legendgroup: 'group',
      })
      data_gcr.push({
        type : 'scatter',
        mode : 'lines',
        name : years[mission],
        x: time,
        y: trace_gcr,
        line: {color: colors[j]},
        legendgroup: 'group1',
      })
      data_saa.push({
        type : 'scatter',
        mode : 'lines',
        name : mission,
        x: time,
        y: trace_saa,
        line: {color: colors[j]},
        legendgroup: 'group',
      })
      data_saa.push({
        type : 'scatter',
        mode : 'lines',
        name : years[mission],
        x: time,
        y: trace_saa,
        line: {color: colors[j]},
        legendgroup: 'group1',
      })
      data_total.push({
        type : 'scatter',
        mode : 'lines',
        name : mission,
        x: time,
        y: trace_total,
        line: {color: colors[j]},
        legendgroup: 'group',
      })
      data_total.push({
        type : 'scatter',
        mode : 'lines',
        name : years[mission],
        x: time,
        y: trace_total,
        line: {color: colors[j]},
        legendgroup: 'group1',
      })
      data_accumulated.push({
        type : 'scatter',
        mode : 'lines',
        name : mission,
        x: time,
        y: trace_accumulated,
        line: {color: colors[j]},
        legendgroup: 'group',
      })
      data_accumulated.push({
        type : 'scatter',
        mode : 'lines',
        name : years[mission],
        x: time,
        y: trace_accumulated,
        line: {color: colors[j]},
        legendgroup: 'group1',
      })
    }
  }


  var layout_gcr = {
    title: "Galactic Cosmic Ray (GCR)",
    yaxis: {
      title: {
        text: 'Dose [mGy/day]',
      }
    },
    xaxis: {
      title: {
        text: "Days after launch",
      }
    },
  }

  var layout_saa = {
    title: "South Atlantic Anomaly (SAA)",
    yaxis: {
      title: {
        text: 'Dose [mGy/day]',
      }
    },
    xaxis: {
      title: {
        text: "Days after launch",
      }
    },
  }

  var layout_total = {
    title: "Total Radiation",
    yaxis: {
      title: {
        text: 'Dose [mGy/day]',
      }
    },
    xaxis: {
      title: {
        text: "Days after launch",
      }
    },
  }

  var layout_accumulated = {
    title: "Accumulated Radiation",
    yaxis: {
      title: {
        text: 'Dose [mGy/day]',
      }
    },
    xaxis: {
      title: {
        text: "Days after launch",
      }
    },
  }

  Plotly.newPlot("compare_gcr", data_gcr, layout_gcr);
  Plotly.newPlot("compare_saa", data_saa, layout_saa);
  Plotly.newPlot("compare_total", data_total, layout_total);
  Plotly.newPlot("compare_accumulated", data_accumulated, layout_accumulated);

  if(no_data != ""){
    document.getElementById("error_message").innerHTML = "No " + type + " data available for " + no_data.substring(0,no_data.length-1);
  }else{
    document.getElementById("error_message").innerHTML = ""
  }
}

const standardDeviation = (arr, usePopulation = false) => {
  const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
  return Math.sqrt(
    arr.reduce((acc, val) => acc.concat((val - mean) ** 2), []).reduce((acc, val) => acc + val, 0) /
      (arr.length - (usePopulation ? 0 : 1))
  );
};

function median(values){
  if(values.length ===0) throw new Error("No inputs");
  values.sort(function(a,b){
    return a-b;
  });
  var half = Math.floor(values.length / 2);
  if (values.length % 2)
    return values[half];
  return (values[half - 1] + values[half]) / 2.0;
}

function mean(arr){
  var total = 0;
  for(var i = 0; i < arr.length; i++) {
    total += arr[i];
  }
  var avg = total / arr.length;
  return avg
}

function update_telemetry_tables(dataJSON){

  var checkboxes = document.getElementsByName("checked-missions")
  var missions = []
  for (var i=0; i<checkboxes.length; i++) {
     if (checkboxes[i].checked) {
        missions.push(checkboxes[i].value);
     }
  }

  var type = document.getElementById("type").innerHTML.trim()
  var data_telemetry = JSON.parse(dataJSON.telemetry_data)

  if(type == "temperature"){
    document.getElementById("min_header_iss").innerHTML = "Min " + type + " ISS</br>Degrees [C]"
    document.getElementById("max_header_iss").innerHTML = "Max " + type + " ISS</br>Degrees [C]"
    document.getElementById("mean_header_iss").innerHTML = "Mean " + type + " ISS</br>Degrees [C]"
    document.getElementById("std_header_iss").innerHTML = "Standard Deviation " + type + " ISS</br>Degrees [C]"
    document.getElementById("median_header_iss").innerHTML = "Median " + type + " ISS</br>Degrees [C]"

    document.getElementById("min_header_ground").innerHTML = "Min " + type + " Ground</br>Degrees [C]"
    document.getElementById("max_header_ground").innerHTML = "Max " + type + " Ground</br>Degrees [C]"
    document.getElementById("mean_header_ground").innerHTML = "Mean " + type + " Ground</br>Degrees [C]"
    document.getElementById("std_header_ground").innerHTML = "Standard Deviation " + type + " Ground</br>Degrees [C]"
    document.getElementById("median_header_ground").innerHTML = "Median " + type + " Ground</br>Degrees [C]"
  }else if(type == "co2"){
    document.getElementById("min_header_iss").innerHTML = "Min " + type.toUpperCase() + " ISS</br>[PPM]"
    document.getElementById("max_header_iss").innerHTML = "Max " + type.toUpperCase() + " ISS</br>[PPM]"
    document.getElementById("mean_header_iss").innerHTML = "Mean " + type.toUpperCase() + " ISS</br>[PPM]"
    document.getElementById("std_header_iss").innerHTML = "Standard Deviation " + type .toUpperCase()+ " ISS</br>[PPM]"
    document.getElementById("median_header_iss").innerHTML = "Median " + type.toUpperCase() + " ISS</br>[PPM]"

    document.getElementById("min_header_ground").innerHTML = "Min " + type.toUpperCase() + " Ground</br>[PPM]"
    document.getElementById("max_header_ground").innerHTML = "Max " + type.toUpperCase() + " Ground</br>[PPM]"
    document.getElementById("mean_header_ground").innerHTML = "Mean " + type.toUpperCase() + " Ground</br>[PPM]"
    document.getElementById("std_header_ground").innerHTML = "Standard Deviation " + type.toUpperCase() + " Ground</br>[PPM]"
    document.getElementById("median_header_ground").innerHTML = "Median " + type.toUpperCase() + " Ground</br>[PPM]"
  }else if(type == "rh"){
    document.getElementById("min_header_iss").innerHTML = "Min " + type.toUpperCase() + " ISS</br>[%]"
    document.getElementById("max_header_iss").innerHTML = "Max " + type.toUpperCase() + " ISS</br>[%]"
    document.getElementById("mean_header_iss").innerHTML = "Mean " + type.toUpperCase() + " ISS</br>[%]"
    document.getElementById("std_header_iss").innerHTML = "Standard Deviation " + type.toUpperCase() + " ISS</br>[%]"
    document.getElementById("median_header_iss").innerHTML = "Median " + type.toUpperCase() + " ISS</br>[%]"

    document.getElementById("min_header_ground").innerHTML = "Min " + type.toUpperCase() + " Ground</br>[%]"
    document.getElementById("max_header_ground").innerHTML = "Max " + type.toUpperCase() + " Ground</br>[%]"
    document.getElementById("mean_header_ground").innerHTML = "Mean " + type.toUpperCase() + " Ground</br>[%]"
    document.getElementById("std_header_ground").innerHTML = "Standard Deviation " + type.toUpperCase() + " Ground</br>[%]"
    document.getElementById("median_header_ground").innerHTML = "Median " + type.toUpperCase() + " Ground</br>[%]"
  }

  //console.log(data_telemetry)
  data_iss = []
  data_ground = []
  for(i=0; i<missions.length; i++){
    var trace_ground = data_telemetry[type + '_ground_' + missions[i]]
    if(trace_ground != undefined){
      var trace_iss = data_telemetry[type + '_iss_' + missions[i]]

      var float_trace_ground = trace_ground.map(val => parseFloat(val));
      var clean_trace_ground = float_trace_ground.filter(val => !isNaN(val));

      var float_trace_iss = trace_iss.map(val => parseFloat(val));
      var clean_trace_iss = float_trace_iss.filter(val => !isNaN(val));

      var min_ground = Math.min.apply(Math, clean_trace_ground)
      var min_iss = Math.min.apply(Math, clean_trace_iss)
      var max_ground = Math.max.apply(Math, clean_trace_ground)
      var max_iss = Math.max.apply(Math, clean_trace_iss)
      var mean_ground = mean(clean_trace_ground)
      var mean_iss = mean(clean_trace_iss)
      var std_ground = standardDeviation(clean_trace_ground)
      var std_iss = standardDeviation(clean_trace_iss)
      var median_ground = median(clean_trace_ground)
      var median_iss = median(clean_trace_iss)

      data_iss.push({
        name: missions[i],
        max: max_iss.toFixed(2),
        min: min_iss.toFixed(2),
        mean: mean_iss.toFixed(2),
        standard_deviation: std_iss.toFixed(2),
        median: median_iss.toFixed(2),
      })

      data_ground.push({
        name: missions[i],
        max: max_ground.toFixed(2),
        min: min_ground.toFixed(2),
        mean: mean_ground.toFixed(2),
        standard_deviation: std_ground.toFixed(2),
        median: median_ground.toFixed(2),
      })
    }else{
      if( type == "co2" && missions[i] == "RR-18"){
        var trace_iss = data_telemetry[type + '_iss_' + missions[i]]
        var min_iss = Math.min.apply(Math, trace_iss)
        var max_iss = Math.max.apply(Math, trace_iss)
        var mean_iss = mean(trace_iss)  
        var std_iss = standardDeviation(trace_iss)
        var median_iss = median(trace_iss)

        data_iss.push({
          name: missions[i],
          max: max_iss.toFixed(2),
          min: min_iss.toFixed(2),
          mean: mean_iss.toFixed(2),
          standard_deviation: std_iss.toFixed(2),
          median: median_iss.toFixed(2),
        })
      }
    }
  }

  $('#compare_table_ISS').DataTable().destroy()
  $('#compare_table_ground').DataTable().destroy()

  table_iss = $('#compare_table_ISS').DataTable( {
      "data": data_iss,
      "columns": [
          {"data": "name", "width": "50%"},
          { "data": "min"},
          { "data": "max" },
          { "data": "mean" },
          { "data": "standard_deviation" },
          { "data": "median" },
      ],
      "scrollX": true,
      scrollY: '90vh',
      scrollCollapse: true,
      destroy:true,
      dom: 'Bfrtip',
      //autoWidth: true,
      //dom: 'Bfrtip',
  } );


  table_ground = $('#compare_table_ground').DataTable( {
      "data": data_ground,
      "columns": [
          {"data": "name"},
          { "data": "min"},
          { "data": "max" },
          { "data": "mean" },
          { "data": "standard_deviation" },
          { "data": "median" },
      ],
      "scrollX": true,
      scrollY: '90vh',
      scrollCollapse: true,
      destroy:true,
      dom: 'Bfrtip',
      //autoWidth: true,
      //dom: 'Bfrtip',
  } );
}


function update_radiation_tables(dataJSON){

  var checkboxes = document.getElementsByName("checked-missions")
  var missions = []
  for (var i=0; i<checkboxes.length; i++) {
     if (checkboxes[i].checked) {
        missions.push(checkboxes[i].value);
     }
  }

  var type = document.getElementById("type").innerHTML.trim()
  var data_radiation = JSON.parse(dataJSON.radiation_data)

  document.getElementById("min_header_gcr").innerHTML = "Min GCR Dose</br>[mGy/day]"
  document.getElementById("max_header_gcr").innerHTML = "Max GCR Dose</br>[mGy/day]"
  document.getElementById("mean_header_gcr").innerHTML = "Mean GCR Dose</br>[mGy/day]"
  document.getElementById("std_header_gcr").innerHTML = "Standard Deviation GCR Dose</br>[mGy/day]"
  document.getElementById("median_header_gcr").innerHTML = "Median GCR Dose</br>[mGy/day]"

  document.getElementById("min_header_saa").innerHTML = "Min SAA Dose</br>[mGy/day]"
  document.getElementById("max_header_saa").innerHTML = "Max SAA Dose</br>[mGy/day]"
  document.getElementById("mean_header_saa").innerHTML = "Mean SAA Dose</br>[mGy/day]"
  document.getElementById("std_header_saa").innerHTML = "Standard Deviation SAA Dose</br>[mGy/day]"
  document.getElementById("median_header_saa").innerHTML = "Median SAA Dose</br>[mGy/day]"

  document.getElementById("min_header_total").innerHTML = "Min Total Dose</br>[mGy/day]"
  document.getElementById("max_header_total").innerHTML = "Max Total Dose</br>[mGy/day]"
  document.getElementById("mean_header_total").innerHTML = "Mean Total Dose</br>[mGy/day]"
  document.getElementById("std_header_total").innerHTML = "Standard Deviation Total Dose</br>[mGy/day]"
  document.getElementById("median_header_total").innerHTML = "Median Total Dose</br>[mGy/day]"

  //console.log(data_telemetry)
  data_gcr = []
  data_saa = []
  data_total = []
  for(i=0; i<missions.length; i++){
    var trace_gcr = data_radiation['gcr_' + missions[i]]
    if(trace_gcr != undefined){
      var trace_saa = data_radiation['saa_' + missions[i]]
      var trace_total = data_radiation['total_' + missions[i]]

      var min_gcr = Math.min.apply(Math, trace_gcr)
      var min_saa = Math.min.apply(Math, trace_saa)
      var min_total = Math.min.apply(Math, trace_total)
      var max_gcr = Math.max.apply(Math, trace_gcr)
      var max_saa = Math.max.apply(Math, trace_saa)
      var max_total = Math.max.apply(Math, trace_total)
      var mean_gcr = mean(trace_gcr)
      var mean_saa = mean(trace_saa)
      var mean_total = mean(trace_total)
      var std_gcr = standardDeviation(trace_gcr)
      var std_saa = standardDeviation(trace_saa)
      var std_total = standardDeviation(trace_total)
      var median_gcr = median(trace_gcr)
      var median_saa = median(trace_saa)
      var median_total = median(trace_total)

      data_gcr.push({
        name: missions[i],
        max: max_gcr.toFixed(2),
        min: min_gcr.toFixed(2),
        mean: mean_gcr.toFixed(2),
        standard_deviation: std_gcr.toFixed(2),
        median: median_gcr.toFixed(2),
      })

      data_saa.push({
        name: missions[i],
        max: max_saa.toFixed(2),
        min: min_saa.toFixed(2),
        mean: mean_saa.toFixed(2),
        standard_deviation: std_saa.toFixed(2),
        median: median_saa.toFixed(2),
      })

      data_total.push({
        name: missions[i],
        max: max_total.toFixed(2),
        min: min_total.toFixed(2),
        mean: mean_total.toFixed(2),
        standard_deviation: std_total.toFixed(2),
        median: median_total.toFixed(2),
      })
    }
  }

  $('#compare_table_gcr').DataTable().destroy()
  $('#compare_table_saa').DataTable().destroy()
  $('#compare_table_total').DataTable().destroy()

  table_iss = $('#compare_table_gcr').DataTable( {
      "data": data_gcr,
      "columns": [
          {"data": "name", "width": "50%"},
          { "data": "min"},
          { "data": "max" },
          { "data": "mean" },
          { "data": "standard_deviation" },
          { "data": "median" },
      ],
      "scrollX": true,
      scrollY: '90vh',
      scrollCollapse: true,
      destroy:true,
      dom: 'Bfrtip',
      //autoWidth: true,
      //dom: 'Bfrtip',
  } );


  table_ground = $('#compare_table_saa').DataTable( {
      "data": data_saa,
      "columns": [
          {"data": "name"},
          { "data": "min"},
          { "data": "max" },
          { "data": "mean" },
          { "data": "standard_deviation" },
          { "data": "median" },
      ],
      "scrollX": true,
      scrollY: '90vh',
      scrollCollapse: true,
      destroy:true,
      dom: 'Bfrtip',
      //autoWidth: true,
      //dom: 'Bfrtip',
  } );

  table_ground = $('#compare_table_total').DataTable( {
      "data": data_total,
      "columns": [
          {"data": "name"},
          { "data": "min"},
          { "data": "max" },
          { "data": "mean" },
          { "data": "standard_deviation" },
          { "data": "median" },
      ],
      "scrollX": true,
      scrollY: '90vh',
      scrollCollapse: true,
      destroy:true,
      dom: 'Bfrtip',
      //autoWidth: true,
      //dom: 'Bfrtip',
  } );
}

function log_message(message){
  var url = `/eda/log_info/` + encodeURIComponent(message)
  fetch(url)
    .then((response) => response.json())
    .then((data) => {
          if (data.success) {
            console.log('Successful log');
          }
    });
}
