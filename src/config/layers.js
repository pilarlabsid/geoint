export const LAYERS_CONFIG = [
  { 
    id: 'wiup', 
    name: 'Wilayah Izin Usaha Pertambangan', 
    type: 'kmz', 
    url: `${import.meta.env.BASE_URL}WIUP.kmz`, 
    defaultVisible: true 
  },
  { 
    id: 'sendiki1', 
    name: 'Citra Sendiki 1', 
    type: 'image', 
    url: `${import.meta.env.BASE_URL}sendiki1.png`, 
    bounds: [[-8.416495941, 112.729402516], [-8.412378242, 112.733722168]], 
    defaultVisible: true 
  },
  { 
    id: 'sendiki2', 
    name: 'Citra Sendiki 2', 
    type: 'image', 
    url: `${import.meta.env.BASE_URL}sendiki2.png`, 
    bounds: [[-8.417032378, 112.722653396], [-8.411136533, 112.730621757]], 
    defaultVisible: true 
  },
  { 
    id: 'sendiki3', 
    name: 'Citra Sendiki 3', 
    type: 'image', 
    url: `${import.meta.env.BASE_URL}sendiki3.png`, 
    bounds: [[-8.418968330, 112.714142185], [-8.412651315, 112.723024363]], 
    defaultVisible: true 
  }
];
