function radiation_plot(dataJSON, type){
  if(dataJSON){
    var dataJSON = JSON.parse(dataJSON.radiation_data)
    var time = dataJSON.time
    var data_trace = dataJSON[type]

    //console.log(time)
    //console.log(data_ground)
   
    if(type == "gcr"){
      yaxis = "Dose [mGy/day]"
      title = "Galactic Cosmic Ray (GCR)"
      color = "#1f77b4"
    }else if(type == "saa"){
      yaxis = "Dose [mGy/day]"
      title = "South Atlantic Anomaly (SAA)"
      color = "#ff7f0e"
    }else if(type =='total'){
      yaxis == "Dose [mGY/day]"
      title = "Total Radiation Dose"
      color = "#d62728"
    }else if(type =='accumulated'){
      yaxis == "Dose [mGy/day]"
      title = "Accumulated Radiation Dose"
      color = "#2ca02c"
    }

    var trace = {
      type : 'scatter',
      mode : 'lines',
      name : 'ISS',
      x: time,
      y: data_trace,
      hoverinfo: 'all',
      marker:{
        color: color
      }
    }


    var data = [trace]

  
    shapes = []
    annotations = []
    if(document.getElementById("showMilestones").checked == true){
      var milestones = dataJSON.milestones
      var i=0
      for(let key in milestones){
        shapes.push({
          type: 'line',
          x0: milestones[key],
          y0: 0,
          x1: milestones[key],
          yref: 'paper',
          y1: 1,
          line: {
            color: 'grey',
            width: 1.5,
            dash: 'dot'
          }
        })
        annotations.push({
          x:  milestones[key],
          y: 1,
          xref: 'x',
          yref: 'paper',
          text: key,
          showarrow: true,
          ax: 10,
          ay: -10 - i,
          arrowhead: 4
        })
        i += 8
      }
    }

    var layout = {
      title: "",
      yaxis: {
        title: {
          text: yaxis,
        }
      },
      xaxis: {
        title: {
          text: "Date [MM/DD/YY HH:mm]",
        }
      },
      shapes: shapes,
      annotations: annotations,
      margin: {
        t: 50,
      },
    }

    Plotly.newPlot(type, data, layout);


  }
}

function all_radiation_plot(dataJSON){
  if(dataJSON){
    var dataJSON = JSON.parse(dataJSON.radiation_data)

    if(Object.keys(dataJSON).length ==0 ){
      document.getElementById("gcr").innerHTML = "There is no available Radiation data for the selected mission."
      document.getElementById("saa").innerHTML = ""
      document.getElementById("accumulated").innerHTML = ""
      document.getElementById("all_radiation").innerHTML = ""

      document.getElementById("gcr_title").innerHTML = ""
      document.getElementById("saa_title").innerHTML = ""
      document.getElementById("accumulated_title").innerHTML = ""
      document.getElementById("total_title").innerHTML = ""
    }else{
      var time = dataJSON.time
      var data_gcr = dataJSON['gcr']
      var data_saa = dataJSON['saa']
      var data_total = dataJSON['total']

      //console.log(time)
      //console.log(data_ground)

      var trace_gcr = {
        type : 'scatter',
        mode : 'lines',
        name : 'GCR',
        x: time,
        y: data_gcr,
        marker:{
          color: "#1f77b4"
        }
      }

      var trace_saa = {
        type : 'scatter',
        mode : 'lines',
        name : 'SAA',
        x: time,
        y: data_saa,
        marker:{
          color: "#ff7f0e"
        }
      }

      var trace_total = {
        type : 'scatter',
        mode : 'lines',
        name : 'Total',
        x: time,
        y: data_total,
        marker:{
          color: "#d62728"
        }
      }


      var data = [trace_gcr, trace_saa, trace_total]

      yaxis = "Dose [mGy/day]"
      title = "Radiation Dose"

      shapes = []
      annotations = []
      if(document.getElementById("showMilestones").checked == true){
        var milestones = dataJSON.milestones
        var i=0
        for(let key in milestones){
          shapes.push({
            type: 'line',
            x0: milestones[key],
            y0: 0,
            x1: milestones[key],
            yref: 'paper',
            y1: 1,
            line: {
              color: 'grey',
              width: 1.5,
              dash: 'dot'
            }
          })
          annotations.push({
            x:  milestones[key],
            y: 1,
            xref: 'x',
            yref: 'paper',
            text: key,
            showarrow: true,
            ax: 10,
            ay: -10 - i,
            arrowhead: 4
          })
          i += 8
        }
      }

      var layout = {
        title: "",
        yaxis: {
          title: {
            text: yaxis,
          }
        },
        xaxis: {
          title: {
            text: "Date [MM/DD/YY HH:mm]",
          }
        },
        shapes: shapes,
        annotations: annotations,
        margin: {
          t: 50,
        },
      }

      Plotly.newPlot("all_radiation", data, layout);
    }
  }
}
